# Scrapbound backlog dashboard

A local, read-only Flask dashboard for Scrapbound's Markdown backlog. By
default it reads task definitions and status from `docs/BACKLOG.md` and ordering,
dependencies, and next outcomes from `docs/DEVELOPMENT_QUEUE.md`. Markdown
remains the source of truth; update those files rather than changing status in
the dashboard.

The dashboard provides:

- A progress overview grouped by the backlog's sections, status/priority filters,
  task details, and linked dependency graph.
- The curated development queue in its declared order, with dependency notes
  connected back to backlog tasks.
- A prerequisite-first suggested plan, status history, source TODO/FIXME/XXX
  triage inbox, and manager report.
- JSON integrations: `/api/backlog`, `/api/dependencies`, `/api/plan`,
  `/api/history`, `/api/report`, and `/api/decisions`.

The parser also retains support for the older directory-based backlog format
when `create_app()` is passed a TODO directory, which keeps isolated fixtures
and legacy uses working. In the normal Scrapbound launch, the current backlog
and queue files are selected automatically.

## Run

From the repository root:

```powershell
python -m pip install -r _backlog_dashboard/requirements.txt
python _backlog_dashboard/app.py
```

Or double-click [`run.bat`](run.bat). Open <http://127.0.0.1:5000>. The app
binds to loopback only and reloads Markdown on page/API requests.

The source-marker inbox is cached in `_backlog_dashboard/.data/task-state.sqlite3`.
Status and file history are observed when the dashboard next reads the source;
the first read establishes a baseline. No database credentials or Scrapbound
application data are used by this dashboard.

Run tests:

```powershell
python -m unittest discover -s _backlog_dashboard/tests -v
```
