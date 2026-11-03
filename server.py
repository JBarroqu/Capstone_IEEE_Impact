import base64, hashlib, hmac, json, mimetypes, os, re, secrets, sqlite3, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT=Path(__file__).resolve().parent
DB=ROOT/'buddy.sqlite3'
SESSION_AGE=7*24*3600

def connect():
    db=sqlite3.connect(DB,timeout=10)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=10000')
    return db

def init():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS milestones(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS invitations(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,buddy_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(project_id,buddy_id));
        CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
        CREATE INDEX IF NOT EXISTS idx_invitations_buddy ON invitations(buddy_id);
        ''')

def password_hash(password):
    salt=secrets.token_bytes(16)
    digest=hashlib.pbkdf2_hmac('sha256',password.encode(),salt,260000)
    return 'pbkdf2_sha256$260000$'+base64.b64encode(salt).decode()+'$'+base64.b64encode(digest).decode()

def check_password(password,stored):
    try:
        algorithm,iterations,salt,digest=stored.split('$')
        if algorithm!='pbkdf2_sha256':return False
        test=hashlib.pbkdf2_hmac('sha256',password.encode(),base64.b64decode(salt),int(iterations))
        return hmac.compare_digest(test,base64.b64decode(digest))
    except (ValueError,TypeError):return False

class ApiError(Exception):
    def __init__(self,status,message):self.status,self.message=status,message

class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):super().log_message(fmt,*args)
    def send_json(self,status,data,cookie=None):
        payload=json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(payload)
    def fail(self,status,message):raise ApiError(status,message)
    def body(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<0 or size>65536:self.fail(413,'Request too large')
            if size==0:return {}
            obj=json.loads(self.rfile.read(size))
            if not isinstance(obj,dict):self.fail(400,'Expected JSON object')
            return obj
        except (ValueError,UnicodeDecodeError):self.fail(400,'Invalid JSON')
    def auth(self,db):
        cookie=SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''))
        except Exception:pass
        token=cookie.get('session')
        if not token:self.fail(401,'Please log in')
        hashed=hashlib.sha256(token.value.encode()).hexdigest()
        user=db.execute('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',(hashed,int(time.time()))).fetchone()
        if not user:self.fail(401,'Session expired; please log in')
        return user
    def issue_session(self,db,user):
        token=secrets.token_urlsafe(32)
        db.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],int(time.time())+SESSION_AGE))
        return 'session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+str(SESSION_AGE)
    def project(self,db,pid,user):
        row=db.execute('''SELECT p.*,u.username AS owner, (SELECT COUNT(*) FROM milestones m WHERE m.project_id=p.id) AS total,
          (SELECT COUNT(*) FROM milestones m WHERE m.project_id=p.id AND m.done=1) AS completed,
          (SELECT u2.username FROM invitations i JOIN users u2 ON u2.id=i.buddy_id WHERE i.project_id=p.id AND i.status='accepted' LIMIT 1) AS buddy
          FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=?''',(pid,)).fetchone()
        if not row:self.fail(404,'Project not found')
        invited=db.execute('SELECT status FROM invitations WHERE project_id=? AND buddy_id=?',(pid,user['id'])).fetchone()
        if row['owner_id']!=user['id'] and (not invited or invited['status']!='accepted'):self.fail(403,'Not authorized for this project')
        return row
    def owner(self,row,user):
        if row['owner_id']!=user['id']:self.fail(403,'Only the project owner can do that')
    def dispatch(self,method):
        parsed=urlparse(self.path);path=parsed.path
        if method=='GET' and not path.startswith('/api/'):
            if path not in ('/','/index.html','/app.js','/style.css'):self.send_error(404);return
            filename='index.html' if path=='/' else path[1:]
            content=(ROOT/filename).read_bytes()
            self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(filename)[0] or 'text/plain');self.send_header('Content-Length',str(len(content)));self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(content);return
        if not path.startswith('/api/'):self.fail(404,'Not found')
        data=self.body() if method in ('POST','PATCH','PUT') else {}
        parts=[p for p in path.split('/') if p][1:]
        with connect() as db:
            if parts==['register'] and method=='POST':
                username=str(data.get('username','')).strip();password=data.get('password','')
                if not re.fullmatch(r'[A-Za-z0-9_]{3,30}',username):self.fail(400,'Username must be 3–30 letters, digits or underscores')
                if not isinstance(password,str) or len(password)<8 or len(password)>256:self.fail(400,'Password must be 8–256 characters')
                try:
                    cur=db.execute('INSERT INTO users(username,password_hash) VALUES(?,?)',(username,password_hash(password)))
                except sqlite3.IntegrityError:self.fail(409,'Username already exists')
                user=db.execute('SELECT id,username FROM users WHERE id=?',(cur.lastrowid,)).fetchone()
                cookie=self.issue_session(db,user);self.send_json(201,dict(user),cookie);return
            if parts==['login'] and method=='POST':
                username=str(data.get('username','')).strip();password=data.get('password','')
                user=db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
                if not user or not isinstance(password,str) or not check_password(password,user['password_hash']):self.fail(401,'Invalid username or password')
                cookie=self.issue_session(db,user);self.send_json(200,{'id':user['id'],'username':user['username']},cookie);return
            user=self.auth(db)
            if parts==['logout'] and method=='POST':
                cookie=SimpleCookie();cookie.load(self.headers.get('Cookie',''))
                if 'session' in cookie:db.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(cookie['session'].value.encode()).hexdigest(),))
                self.send_json(200,{'ok':True},'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return
            if parts==['me'] and method=='GET':self.send_json(200,dict(user));return
            if parts==['users'] and method=='GET':
                q=parse_qs(parsed.query).get('q',[''])[0].strip()
                if len(q)<1:self.send_json(200,[]);return
                # Escape LIKE metacharacters via explicit ESCAPE clause in query below
                rows=db.execute("SELECT id,username FROM users WHERE id!=? AND username LIKE ? ESCAPE '\\' ORDER BY username LIMIT 20",(user['id'],'%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%')).fetchall()
                self.send_json(200,[dict(r) for r in rows]);return
            if parts in (['projects'], ['buddy-projects']) and method=='GET':
                if parts==['projects']:
                    filter_sql='p.owner_id=?'
                    params=(user['id'],)
                else:
                    filter_sql="p.owner_id!=? AND EXISTS (SELECT 1 FROM invitations i WHERE i.project_id=p.id AND i.buddy_id=? AND i.status='accepted')"
                    params=(user['id'],user['id'])
                rows=db.execute('''SELECT p.id,p.title,p.description,p.owner_id,u.username AS owner,
                    (SELECT COUNT(*) FROM milestones m WHERE m.project_id=p.id) AS total,
                    (SELECT COUNT(*) FROM milestones m WHERE m.project_id=p.id AND m.done=1) AS completed,
                    (SELECT u2.username FROM invitations i JOIN users u2 ON u2.id=i.buddy_id WHERE i.project_id=p.id AND i.status='accepted' LIMIT 1) AS buddy
                    FROM projects p JOIN users u ON u.id=p.owner_id WHERE ''' + filter_sql + ' ORDER BY p.id DESC',params).fetchall()
                self.send_json(200,[dict(r) for r in rows]);return
            if parts==['projects'] and method=='POST':
                title=str(data.get('title','')).strip();desc=str(data.get('description','')).strip()
                if not 1<=len(title)<=120 or len(desc)>2000:self.fail(400,'Title required (max 120); description max 2000')
                cur=db.execute('INSERT INTO projects(owner_id,title,description) VALUES(?,?,?)',(user['id'],title,desc));self.send_json(201,{'id':cur.lastrowid});return
            if parts==['invitations'] and method=='GET':
                rows=db.execute('''SELECT i.id,i.project_id,i.status,p.title AS project,u.username AS owner FROM invitations i JOIN projects p ON p.id=i.project_id JOIN users u ON u.id=p.owner_id WHERE i.buddy_id=? ORDER BY i.id DESC''',(user['id'],)).fetchall()
                self.send_json(200,[dict(r) for r in rows]);return
            if len(parts)==2 and parts[0]=='invitations' and parts[1].isdigit() and method=='PATCH':
                status=data.get('status')
                if status not in ('accepted','declined'):self.fail(400,'Invalid invitation status')
                invite=db.execute('SELECT * FROM invitations WHERE id=? AND buddy_id=?',(int(parts[1]),user['id'])).fetchone()
                if not invite:self.fail(404,'Invitation not found')
                if invite['status']!='pending':self.fail(409,'Invitation already answered')
                if status=='accepted':
                    existing=db.execute("SELECT id FROM invitations WHERE project_id=? AND status='accepted'",(invite['project_id'],)).fetchone()
                    if existing:self.fail(409,'Project already has an accepted Buddy')
                db.execute('UPDATE invitations SET status=? WHERE id=?',(status,invite['id']));self.send_json(200,{'ok':True});return
            if len(parts)>=2 and parts[0]=='projects' and parts[1].isdigit():
                pid=int(parts[1]);p=self.project(db,pid,user)
                if len(parts)==2:
                    if method=='GET':
                        result=dict(p)
                        result['milestones']=[dict(r) for r in db.execute('SELECT id,title,done FROM milestones WHERE project_id=? ORDER BY id',(pid,))]
                        result['invitations']=[dict(r) for r in db.execute('SELECT i.id,i.status,u.username FROM invitations i JOIN users u ON u.id=i.buddy_id WHERE i.project_id=? ORDER BY i.id DESC',(pid,))] if p['owner_id']==user['id'] else []
                        result['feedback']=[dict(r) for r in db.execute('SELECT f.id,f.body,f.created_at,u.username FROM feedback f JOIN users u ON u.id=f.author_id WHERE f.project_id=? ORDER BY f.id DESC',(pid,))]
                        self.send_json(200,result);return
                    self.owner(p,user)
                    if method=='PATCH':
                        title=str(data.get('title','')).strip();desc=str(data.get('description','')).strip()
                        if not 1<=len(title)<=120 or len(desc)>2000:self.fail(400,'Invalid title or description')
                        db.execute('UPDATE projects SET title=?,description=? WHERE id=?',(title,desc,pid));self.send_json(200,{'ok':True});return
                    if method=='DELETE':db.execute('DELETE FROM projects WHERE id=?',(pid,));self.send_json(200,{'ok':True});return
                if len(parts)==3 and parts[2]=='milestones' and method=='POST':
                    self.owner(p,user);title=str(data.get('title','')).strip()
                    if not 1<=len(title)<=120:self.fail(400,'Milestone title required (max 120)')
                    cur=db.execute('INSERT INTO milestones(project_id,title) VALUES(?,?)',(pid,title));self.send_json(201,{'id':cur.lastrowid});return
                if len(parts)==4 and parts[2]=='milestones' and parts[3].isdigit():
                    self.owner(p,user);mid=int(parts[3]);m=db.execute('SELECT id FROM milestones WHERE id=? AND project_id=?',(mid,pid)).fetchone()
                    if not m:self.fail(404,'Milestone not found')
                    if method=='PATCH':db.execute('UPDATE milestones SET done=? WHERE id=?',(int(bool(data.get('done'))),mid));self.send_json(200,{'ok':True});return
                    if method=='DELETE':db.execute('DELETE FROM milestones WHERE id=?',(mid,));self.send_json(200,{'ok':True});return
                if len(parts)==3 and parts[2]=='invite' and method=='POST':
                    self.owner(p,user);buddy_id=data.get('buddy_id')
                    if not isinstance(buddy_id,int) or buddy_id==user['id']:self.fail(400,'Select another user')
                    target=db.execute('SELECT id FROM users WHERE id=?',(buddy_id,)).fetchone()
                    if not target:self.fail(404,'User not found')
                    existing=db.execute('SELECT id FROM invitations WHERE project_id=?',(pid,)).fetchone()
                    if existing:self.fail(409,'This project already has a Buddy invitation; remove it first')
                    db.execute('INSERT INTO invitations(project_id,buddy_id) VALUES(?,?)',(pid,buddy_id));self.send_json(201,{'ok':True});return
                if len(parts)==4 and parts[2]=='invite' and parts[3].isdigit() and method=='DELETE':
                    self.owner(p,user);db.execute('DELETE FROM invitations WHERE id=? AND project_id=?',(int(parts[3]),pid));self.send_json(200,{'ok':True});return
                if len(parts)==3 and parts[2]=='feedback' and method=='POST':
                    if p['owner_id']==user['id']:self.fail(403,'Only the Buddy can leave feedback')
                    body=str(data.get('body','')).strip()
                    if not 1<=len(body)<=1000:self.fail(400,'Feedback required (max 1000)')
                    db.execute('INSERT INTO feedback(project_id,author_id,body) VALUES(?,?,?)',(pid,user['id'],body));self.send_json(201,{'ok':True});return
            self.fail(404,'Endpoint not found')
    def handle_request(self,method):
        try:self.dispatch(method)
        except ApiError as e:self.send_json(e.status,{'error':e.message})
        except sqlite3.IntegrityError:self.send_json(409,{'error':'Database constraint violation'})
        except Exception:
            import traceback;traceback.print_exc();self.send_json(500,{'error':'Internal server error'})
    def do_GET(self):self.handle_request('GET')
    def do_POST(self):self.handle_request('POST')
    def do_PATCH(self):self.handle_request('PATCH')
    def do_DELETE(self):self.handle_request('DELETE')

if __name__=='__main__':
    init();port=int(os.environ.get('PORT','8000'))
    print(f'Impact++ Buddy System running at http://127.0.0.1:{port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
