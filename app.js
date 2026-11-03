const $ = s => document.querySelector(s);

const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
};

const add = (parent, ...children) => {
    children.forEach(c => parent.append(c));
    return parent;
};

let me = null;
let selected = null;

function notice(message) {
    $('#notice').textContent = message;

    setTimeout(() => {
        if ($('#notice').textContent === message) {
            $('#notice').textContent = '';
        }
    }, 5000);
}

async function api(path, method = 'GET', body) {
    const r = await fetch('/api' + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
    });

    let v = await r.json();

    if (!r.ok) {
        throw Error(v.error || 'Request failed');
    }

    return v;
}

async function action(fn) {
    try {
        await fn();
    } catch (e) {
        notice(e.message);
    }
}

function field(name, value = '', type = 'text') {
    const label = el('label', name);
    const input = el(type === 'textarea' ? 'textarea' : 'input');

    if (type !== 'textarea') {
        input.type = type;
    }

    input.value = value;
    input.required = name !== 'Description';
    label.append(input);

    return { label, input };
}

function button(text, fn, cls = '') {
    const b = el('button', text, cls);
    b.type = 'button';
    b.onclick = () => action(fn);
    return b;
}

function showAuth() {
    me = null;
    selected = null;

    $('#auth').hidden = false;
    $('#app').hidden = true;
    $('#identity').replaceChildren();
}

async function boot() {
    try {
        me = await api('/me');

        $('#auth').hidden = true;
        $('#app').hidden = false;

        $('#identity').replaceChildren(
            el('span', '@' + me.username + '  '),
            button('Log out', async () => {
                await api('/logout', 'POST');
                showAuth();
            })
        );

        await refresh();
    } catch {
        showAuth();
    }
}

async function refresh() {
    const [projects, buddyProjects, invitations] = await Promise.all([
        api('/projects'),
        api('/buddy-projects'),
        api('/invitations')
    ]);

    const p = $('#projects');
    const bp = $('#buddy-projects');
    const i = $('#invitations');

    p.replaceChildren();
    bp.replaceChildren();
    i.replaceChildren();

    if (!projects.length) {
        p.append(el('div', 'No projects yet. Create one to get started.', 'empty'));
    }

    if (!buddyProjects.length) {
        bp.append(el('div', 'No accepted Buddy projects yet.', 'empty'));
    }

    for (const project of [...projects, ...buddyProjects]) {
        const target = project.owner_id === me.id ? p : bp;
        const card = el('div', undefined, 'project-card');

        const pct = project.total
            ? Math.round(100 * project.completed / project.total)
            : 0;

        add(
            card,
            el('h3', project.title),
            el('p', project.description || 'No description'),
            el(
                'div',
                project.owner_id === me.id
                    ? 'Owned by you'
                    : 'Owner: ' + project.owner,
                'muted'
            ),
            el(
                'div',
                project.buddy
                    ? 'Buddy: ' + project.buddy
                    : 'No accepted Buddy',
                'muted'
            )
        );

        const bar = el('div', undefined, 'progress');
        const fill = el('div');

        fill.style.width = pct + '%';
        bar.append(fill);

        add(
            card,
            bar,
            el(
                'div',
                `${project.completed}/${project.total} milestones (${pct}%)`,
                'muted'
            )
        );

        card.onclick = () => action(() => openProject(project.id));
        target.append(card);
    }

    if (!invitations.length) {
        i.append(el('div', 'No invitations yet.', 'empty'));
    }

    for (const invite of invitations) {
        const card = el('div', undefined, 'panel');

        add(
            card,
            el('strong', invite.project),
            el('p', 'From @' + invite.owner),
            el('span', invite.status, 'tag')
        );

        if (invite.status === 'pending') {
            const row = el('div', undefined, 'row');

            add(
                row,
                button('Accept', async () => {
                    await api('/invitations/' + invite.id, 'PATCH', {
                        status: 'accepted'
                    });
                    await refresh();
                }),
                button('Decline', async () => {
                    await api('/invitations/' + invite.id, 'PATCH', {
                        status: 'declined'
                    });
                    await refresh();
                }, 'secondary')
            );

            card.append(row);
        }

        i.append(card);
    }
}

async function openProject(id) {
    selected = id;

    const project = await api('/projects/' + id);
    const own = project.owner_id === me.id;
    const d = $('#detail');

    d.hidden = false;
    d.replaceChildren();

    const heading = el('div', undefined, 'toolbar');

    add(
        heading,
        el('h2', project.title),
        button('Close', () => {
            d.hidden = true;
            selected = null;
        }, 'secondary')
    );

    d.append(heading);
    d.append(el('p', project.description || 'No description'));
    d.append(
        el(
            'p',
            'Owner: @' + project.owner +
            ' • Buddy: ' + (project.buddy || 'none'),
            'muted'
        )
    );

    if (own) {
        const row = el('div', undefined, 'row');

        add(
            row,
            button('Edit project', async () => {
                const title = prompt('Project title', project.title);
                if (title === null) return;

                const description = prompt('Description', project.description);
                if (description === null) return;

                await api('/projects/' + id, 'PATCH', { title, description });
                await refresh();
                await openProject(id);
            }, 'secondary'),

            button('Delete project', async () => {
                if (!confirm('Permanently delete this project and all its data?')) {
                    return;
                }

                await api('/projects/' + id, 'DELETE');
                d.hidden = true;
                await refresh();
            }, 'danger')
        );

        d.append(row);
    }

    d.append(
        el('div', undefined, 'divider'),
        el('h2', 'Milestones')
    );

    if (!project.milestones.length) {
        d.append(el('p', 'No milestones yet.'));
    }

    for (const m of project.milestones) {
        const row = el('div', undefined, 'row');
        const check = el('input');

        check.type = 'checkbox';
        check.checked = !!m.done;
        check.disabled = !own;

        check.onchange = () => action(async () => {
            await api('/projects/' + id + '/milestones/' + m.id, 'PATCH', {
                done: check.checked
            });

            await refresh();
            await openProject(id);
        });

        add(row, check, el('span', m.title));

        if (own) {
            row.append(
                button('Remove', async () => {
                    await api('/projects/' + id + '/milestones/' + m.id, 'DELETE');
                    await refresh();
                    await openProject(id);
                }, 'secondary')
            );
        }

        d.append(row);
    }

    if (own) {
        const f = el('form');
        const t = field('New milestone');

        add(f, t.label);

        const submit = el('button', 'Add milestone');
        f.append(submit);

        f.onsubmit = e => {
            e.preventDefault();

            action(async () => {
                await api('/projects/' + id + '/milestones', 'POST', {
                    title: t.input.value
                });

                await refresh();
                await openProject(id);
            });
        };

        d.append(f);
    }

    d.append(
        el('div', undefined, 'divider'),
        el('h2', 'Buddy relationship')
    );

    if (own) {
        for (const invite of project.invitations) {
            const row = el('div', undefined, 'row');

            add(
                row,
                el('span', '@' + invite.username + ' — ' + invite.status),
                button('Remove invitation', async () => {
                    await api('/projects/' + id + '/invite/' + invite.id, 'DELETE');
                    await refresh();
                    await openProject(id);
                }, 'secondary')
            );

            d.append(row);
        }

        if (!project.invitations.length) {
            const f = el('form');
            const search = field('Find user by username');
            const results = el('div');

            add(f, search.label, results);

            search.input.oninput = () => action(async () => {
                const q = search.input.value.trim();

                results.replaceChildren();

                if (!q) return;

                const users = await api('/users?q=' + encodeURIComponent(q));

                for (const u of users) {
                    results.append(
                        button('Invite @' + u.username, async () => {
                            await api('/projects/' + id + '/invite', 'POST', {
                                buddy_id: u.id
                            });

                            await refresh();
                            await openProject(id);
                        }, 'secondary')
                    );
                }

                if (!users.length) {
                    results.append(el('p', 'No matching users'));
                }
            });

            d.append(f);
        }
    } else {
        d.append(el('p', 'You are an accepted Buddy for this project.'));
    }

    d.append(
        el('div', undefined, 'divider'),
        el('h2', 'Buddy feedback')
    );

    if (!project.feedback.length) {
        d.append(el('p', 'No feedback yet.'));
    }

    for (const feedback of project.feedback) {
        const c = el('div', undefined, 'feedback');

        add(
            c,
            el('strong', '@' + feedback.username),
            el('p', feedback.body),
            el('small', feedback.created_at)
        );

        d.append(c);
    }

    if (!own) {
        const f = el('form');
        const body = field('Your feedback', '', 'textarea');

        add(f, body.label);

        const submit = el('button', 'Post feedback');
        f.append(submit);

        f.onsubmit = e => {
            e.preventDefault();

            action(async () => {
                await api('/projects/' + id + '/feedback', 'POST', {
                    body: body.input.value
                });

                await openProject(id);
            });
        };

        d.append(f);
    }

    d.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

$('#login').onsubmit = e => {
    e.preventDefault();

    action(async () => {
        const d = Object.fromEntries(new FormData(e.target));

        await api('/login', 'POST', d);
        e.target.reset();
        await boot();
    });
};

$('#register').onsubmit = e => {
    e.preventDefault();

    action(async () => {
        const d = Object.fromEntries(new FormData(e.target));

        await api('/register', 'POST', d);
        e.target.reset();
        await boot();
    });
};

$('#new-project').onclick = () => {
    const d = $('#detail');

    d.hidden = false;
    d.replaceChildren(el('h2', 'Create project'));

    const f = el('form');
    const title = field('Title');
    const desc = field('Description', '', 'textarea');

    add(f, title.label, desc.label);

    const submit = el('button', 'Create project');
    f.append(submit);

    f.onsubmit = e => {
        e.preventDefault();

        action(async () => {
            const p = await api('/projects', 'POST', {
                title: title.input.value,
                description: desc.input.value
            });

            await refresh();
            await openProject(p.id);
        });
    };

    d.append(f);
    d.scrollIntoView({ behavior: 'smooth' });
};

boot();