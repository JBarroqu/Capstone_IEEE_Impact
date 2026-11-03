"""End-to-end HTTP/API tests using an isolated temporary SQLite database."""
import contextlib
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db_patch = patch.object(server, 'DB', Path(cls.tmp.name) / 'test.sqlite3')
        cls.db_patch.start()
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.httpd.daemon_threads = True
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_port

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)
        cls.db_patch.stop()
        cls.tmp.cleanup()

    def setUp(self):
        with server.connect() as db:
            db.executescript('DROP TABLE IF EXISTS feedback; DROP TABLE IF EXISTS invitations; DROP TABLE IF EXISTS milestones; DROP TABLE IF EXISTS projects; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS users;')
        server.init()
        self.users = {}

    def request(self, method, path, payload=None, cookie=None, raw=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        headers = {}
        if cookie: headers['Cookie'] = cookie
        if raw is not None:
            body = raw
            headers['Content-Type'] = 'application/json'
        elif payload is not None:
            body = json.dumps(payload).encode()
            headers['Content-Type'] = 'application/json'
        else:
            body = None
        try:
            conn.request(method, path, body=body, headers=headers)
            res = conn.getresponse()
            content = res.read()
            return res.status, json.loads(content) if res.getheader('Content-Type', '').startswith('application/json') else content, res.getheader('Set-Cookie')
        finally:
            conn.close()

    def register(self, name):
        status, user, cookie = self.request('POST', '/api/register', {'username': name, 'password': 'password123'})
        self.assertEqual(status, 201, user)
        self.users[name] = (user['id'], cookie.split(';', 1)[0])
        return self.users[name]

    def call(self, name, method, path, payload=None):
        return self.request(method, path, payload, self.users[name][1])[:2]

    def project(self, name='alice'):
        status, result = self.call(name, 'POST', '/api/projects', {'title': 'Example', 'description': 'A project'})
        self.assertEqual(status, 201)
        return result['id']

    def invite(self, pid, name='bob'):
        uid = self.users[name][0]
        return self.call('alice', 'POST', f'/api/projects/{pid}/invite', {'buddy_id': uid})

    def test_registration_validation_and_duplicate_case(self):
        self.register('alice')
        for name in ('ab', 'bad-name', 'a' * 31):
            self.assertEqual(self.request('POST', '/api/register', {'username': name, 'password': 'password123'})[0], 400)
        self.assertEqual(self.request('POST', '/api/register', {'username': 'alice2', 'password': 'short'})[0], 400)
        self.assertEqual(self.request('POST', '/api/register', {'username': 'ALICE', 'password': 'password123'})[0], 409)
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM users').fetchone()[0], 1)
            self.assertNotIn('password123', db.execute('SELECT password_hash FROM users').fetchone()[0])

    def test_login_logout_session_revocation(self):
        _, cookie = self.register('alice')
        self.assertEqual(self.call('alice', 'GET', '/api/me')[0], 200)
        self.assertEqual(self.request('POST', '/api/login', {'username': 'alice', 'password': 'wrong'})[0], 401)
        status, _, new_cookie = self.request('POST', '/api/login', {'username': 'ALICE', 'password': 'password123'})
        self.assertEqual(status, 200)
        self.assertIn('HttpOnly', new_cookie)
        self.assertIn('SameSite=Strict', new_cookie)
        self.assertEqual(self.call('alice', 'POST', '/api/logout')[0], 200)  # no JSON body
        self.assertEqual(self.request('GET', '/api/me', cookie=cookie)[0], 401)
        self.assertEqual(self.request('GET', '/api/me', cookie=new_cookie.split(';')[0])[0], 200)
        self.assertEqual(self.request('GET', '/api/me')[0], 401)
        self.assertEqual(self.request('GET', '/api/me', cookie='session=invalid')[0], 401)

    def test_expired_session(self):
        self.register('alice')
        with server.connect() as db: db.execute('UPDATE sessions SET expires_at=0')
        self.assertEqual(self.call('alice', 'GET', '/api/me')[0], 401)

    def test_json_and_unknown_routes(self):
        self.register('alice')
        self.assertEqual(self.request('POST', '/api/projects', raw=b'{', cookie=self.users['alice'][1])[0], 400)
        self.assertEqual(self.request('POST', '/api/projects', raw=b'[]', cookie=self.users['alice'][1])[0], 400)
        self.assertEqual(self.request('POST', '/api/projects', raw=b'x' * 65537, cookie=self.users['alice'][1])[0], 413)
        self.assertEqual(self.call('alice', 'GET', '/api/not-real')[0], 404)
        self.assertEqual(self.request('GET', '/not-real')[0], 404)
        for path in ('/', '/app.js', '/style.css'):
            self.assertEqual(self.request('GET', path)[0], 200)

    def test_project_crud_and_private_listing(self):
        self.register('alice'); self.register('bob')
        pid = self.project()
        self.assertEqual(len(self.call('alice', 'GET', '/api/projects')[1]), 1)
        self.assertEqual(self.call('bob', 'GET', '/api/projects')[1], [])
        self.assertEqual(self.call('bob', 'GET', '/api/buddy-projects')[1], [])
        self.assertEqual(self.call('bob', 'GET', f'/api/projects/{pid}')[0], 403)
        self.assertEqual(self.call('bob', 'PATCH', f'/api/projects/{pid}', {'title':'Stolen'})[0], 403)
        self.assertEqual(self.call('bob', 'DELETE', f'/api/projects/{pid}')[0], 403)
        self.assertEqual(self.call('alice', 'PATCH', f'/api/projects/{pid}', {'title': 'Updated', 'description': 'New'})[0], 200)
        self.assertEqual(self.call('alice', 'GET', f'/api/projects/{pid}')[1]['title'], 'Updated')
        self.assertEqual(self.call('alice', 'DELETE', f'/api/projects/{pid}')[0], 200)
        self.assertEqual(self.call('alice', 'GET', f'/api/projects/{pid}')[0], 404)

    def test_project_input_validation(self):
        self.register('alice')
        for title in ('', 'x' * 121):
            self.assertEqual(self.call('alice', 'POST', '/api/projects', {'title': title})[0], 400)
        self.assertEqual(self.call('alice', 'POST', '/api/projects', {'title': 'Valid', 'description': 'x' * 2001})[0], 400)

    def test_milestones_crud_permissions_and_progress(self):
        self.register('alice'); self.register('bob')
        pid = self.project()
        path = f'/api/projects/{pid}/milestones'
        self.assertEqual(self.call('bob', 'POST', path, {'title': 'Forbidden'})[0], 403)
        self.assertEqual(self.call('alice', 'POST', path, {'title': ''})[0], 400)
        status, result = self.call('alice', 'POST', path, {'title': 'First'})
        self.assertEqual(status, 201)
        mid = result['id']
        self.assertEqual(self.call('alice', 'GET', f'/api/projects/{pid}')[1]['total'], 1)
        self.assertEqual(self.call('bob', 'PATCH', f'{path}/{mid}', {'done': True})[0], 403)
        self.assertEqual(self.call('alice', 'PATCH', f'{path}/{mid}', {'done': True})[0], 200)
        self.assertEqual(self.call('alice', 'GET', f'/api/projects/{pid}')[1]['completed'], 1)
        self.assertEqual(self.call('alice', 'PATCH', f'{path}/9999', {'done': True})[0], 404)
        self.assertEqual(self.call('alice', 'DELETE', f'{path}/{mid}')[0], 200)
        self.assertEqual(self.call('alice', 'GET', f'/api/projects/{pid}')[1]['total'], 0)

    def test_search_and_invitation_workflow(self):
        self.register('alice'); self.register('bob'); self.register('charlie')
        pid = self.project()
        self.assertEqual(self.call('alice', 'GET', '/api/users?q=')[1], [])
        self.assertEqual([u['username'] for u in self.call('alice', 'GET', '/api/users?q=bob')[1]], ['bob'])
        self.assertEqual(self.call('alice', 'GET', '/api/users?q=%25')[1], [])
        self.assertEqual(self.call('alice', 'POST', f'/api/projects/{pid}/invite', {'buddy_id': self.users['alice'][0]})[0], 400)
        self.assertEqual(self.call('alice', 'POST', f'/api/projects/{pid}/invite', {'buddy_id': 99999})[0], 404)
        self.assertEqual(self.invite(pid)[0], 201)
        self.assertEqual(self.invite(pid)[0], 409)
        invites = self.call('bob', 'GET', '/api/invitations')[1]
        self.assertEqual(len(invites), 1)
        iid = invites[0]['id']
        self.assertEqual(self.call('charlie', 'PATCH', f'/api/invitations/{iid}', {'status': 'accepted'})[0], 404)
        self.assertEqual(self.call('bob', 'PATCH', f'/api/invitations/{iid}', {'status': 'invalid'})[0], 400)
        self.assertEqual(self.call('bob', 'GET', f'/api/projects/{pid}')[0], 403)
        self.assertEqual(self.call('bob', 'PATCH', f'/api/invitations/{iid}', {'status': 'accepted'})[0], 200)
        self.assertEqual(self.call('bob', 'PATCH', f'/api/invitations/{iid}', {'status': 'declined'})[0], 409)
        self.assertEqual(len(self.call('bob', 'GET', '/api/buddy-projects')[1]), 1)
        self.assertEqual(self.call('bob', 'GET', '/api/projects')[1], [])
        self.assertEqual(self.call('charlie', 'GET', f'/api/projects/{pid}')[0], 403)
        self.assertEqual(self.call('bob', 'GET', f'/api/projects/{pid}')[1]['invitations'], [])
        self.assertEqual(len(self.call('alice', 'GET', f'/api/projects/{pid}')[1]['invitations']), 1)
        self.assertEqual(self.call('bob', 'POST', f'/api/projects/{pid}/milestones', {'title': 'No'})[0], 403)
        self.assertEqual(self.call('alice', 'DELETE', f'/api/projects/{pid}/invite/{iid}')[0], 200)
        self.assertEqual(self.call('bob', 'GET', f'/api/projects/{pid}')[0], 403)
        self.assertEqual(self.call('bob', 'GET', '/api/buddy-projects')[1], [])

    def test_decline_and_reinvite(self):
        self.register('alice'); self.register('bob')
        pid = self.project(); self.invite(pid)
        iid = self.call('bob', 'GET', '/api/invitations')[1][0]['id']
        self.assertEqual(self.call('bob', 'PATCH', f'/api/invitations/{iid}', {'status': 'declined'})[0], 200)
        self.assertEqual(self.call('bob', 'GET', f'/api/projects/{pid}')[0], 403)
        self.assertEqual(self.call('alice', 'DELETE', f'/api/projects/{pid}/invite/{iid}')[0], 200)
        self.assertEqual(self.invite(pid)[0], 201)

    def test_feedback_permissions_and_validation(self):
        self.register('alice'); self.register('bob'); self.register('charlie')
        pid = self.project(); self.invite(pid)
        path = f'/api/projects/{pid}/feedback'
        self.assertEqual(self.call('alice', 'POST', path, {'body': 'Owner'})[0], 403)
        self.assertEqual(self.call('bob', 'POST', path, {'body': 'Pending'})[0], 403)
        iid = self.call('bob', 'GET', '/api/invitations')[1][0]['id']
        self.call('bob', 'PATCH', f'/api/invitations/{iid}', {'status': 'accepted'})
        self.assertEqual(self.call('bob', 'POST', path, {'body': ''})[0], 400)
        self.assertEqual(self.call('bob', 'POST', path, {'body': 'x' * 1001})[0], 400)
        self.assertEqual(self.call('bob', 'POST', path, {'body': 'Good progress'})[0], 201)
        self.assertEqual(self.call('charlie', 'GET', f'/api/projects/{pid}')[0], 403)
        feedback = self.call('alice', 'GET', f'/api/projects/{pid}')[1]['feedback']
        self.assertEqual(feedback[0]['body'], 'Good progress')
        self.assertEqual(feedback[0]['username'], 'bob')
        self.assertEqual(self.call('bob', 'GET', f'/api/projects/{pid}')[1]['feedback'][0]['body'], 'Good progress')

    def test_database_integrity_and_cascades(self):
        self.register('alice'); self.register('bob')
        pid = self.project(); self.invite(pid)
        self.call('alice', 'POST', f'/api/projects/{pid}/milestones', {'title': 'Task'})
        with server.connect() as db:
            self.assertEqual(db.execute('PRAGMA foreign_keys').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM projects').fetchone()[0], 1)
        self.call('alice', 'DELETE', f'/api/projects/{pid}')
        with server.connect() as db:
            for table in ('projects', 'milestones', 'invitations', 'feedback'):
                self.assertEqual(db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM users').fetchone()[0], 2)

    def test_database_survives_new_connection(self):
        self.register('alice'); pid = self.project()
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT title FROM projects WHERE id=?', (pid,)).fetchone()[0], 'Example')
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT title FROM projects WHERE id=?', (pid,)).fetchone()[0], 'Example')


if __name__ == '__main__':
    unittest.main()
