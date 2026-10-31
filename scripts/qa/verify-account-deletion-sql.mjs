/**
 * 회원 탈퇴 SQL(00031) 로컬 검증 — 임시 Postgres 클러스터에 마이그레이션 전체를 적용하고 시나리오를 실행한다.
 * 운영·Supabase에는 접속하지 않는다. 끝나면 클러스터를 지운다.
 *
 *   node scripts/qa/verify-account-deletion-sql.mjs
 *   PG_BIN=/path/to/postgres/bin node scripts/qa/verify-account-deletion-sql.mjs   # 기본: Homebrew postgresql@16
 *
 * Supabase 전용 요소는 최소 대역으로 바꾼다: auth.users·auth.uid(), storage 스키마, supabase_realtime 발행,
 * anon·authenticated·service_role 역할과 기본 권한. pgvector가 없으면 VECTOR(1536) 열을 TEXT로 바꿔 적용한다.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations')
const PG_BIN = process.env.PG_BIN || '/opt/homebrew/opt/postgresql@16/bin'
const TARGET = '00031_account_deletion.sql'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-acctdel-'))
const dataDir = path.join(tmp, 'data')
const port = String(54000 + Math.floor(Math.random() * 900))
let started = false
let checks = 0

function bin(name) { return path.join(PG_BIN, name) }
function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', PGTZ: 'UTC', PGCLIENTENCODING: 'UTF8' } })
  if (r.error) throw r.error
  return r
}
function check(condition, label) { assert.ok(condition, label); checks++; console.log(`PASS ${label}`) }

/** SQL 실행. ok=false면 실패한 오류 문자열을 돌려준다(기대한 실패 확인용). */
function psql(sql, { role = null, expectError = false } = {}) {
  const body = role ? `SET ROLE ${role};\n${sql}` : sql
  const r = run(bin('psql'), ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', tmp, '-p', port, '-U', 'postgres', '-d', 'postgres'], body)
  if (expectError) {
    assert.notEqual(r.status, 0, `오류를 기대했지만 성공: ${sql.slice(0, 120)}`)
    return r.stderr
  }
  if (r.status !== 0) throw new Error(`SQL 실패:\n${r.stderr}\n--- SQL ---\n${body.slice(0, 2000)}`)
  return r.stdout.trim()
}
const json = (sql, opts) => JSON.parse(psql(sql, opts))
const scalar = (sql) => psql(sql)

const BOOTSTRAP = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
CREATE PUBLICATION supabase_realtime;
`

// 고정 ID — 읽기 쉽게 끝자리로 구분
const id = (prefix, n) => `${prefix}-0000-0000-0000-${String(n).padStart(12, '0')}`
const U = { A: id('00000000', 10), B: id('00000000', 11), C: id('00000000', 12), D: id('00000000', 13), E: id('00000000', 14) }
const W = { solo: id('10000000', 1), personal: id('10000000', 2), team: id('10000000', 3), other: id('10000000', 4), team2: id('10000000', 5) }
const P = { solo1: id('20000000', 1), solo2: id('20000000', 2), personal: id('20000000', 3), team: id('20000000', 4), simA: id('20000000', 5), simB: id('20000000', 6), other: id('20000000', 7), team2: id('20000000', 8) }
const ROLES_TEXT = JSON.stringify({ roles: [{ name: '송선생', task: '자료 수집' }] })

const SEED = `
INSERT INTO auth.users (id, email) VALUES
  ('${U.A}', 'Leaver@School.kr'), ('${U.B}', 'b@school.kr'), ('${U.C}', 'c@school.kr'), ('${U.D}', 'd@school.kr'), ('${U.E}', 'e@school.kr');
INSERT INTO users (id, email, display_name) VALUES
  ('${U.A}', 'Leaver@School.kr', '송선생'), ('${U.B}', 'b@school.kr', '비교사'), ('${U.C}', 'c@school.kr', '씨교사'),
  ('${U.D}', 'd@school.kr', '디교사'), ('${U.E}', 'e@school.kr', '이교사');

INSERT INTO workspaces (id, name, owner_id, workflow_config, created_at) VALUES
  ('${W.solo}', '혼자 쓰는 곳', '${U.A}', '{}', '2026-01-01'),
  ('${W.personal}', '개인', '${U.A}', '{"personal": true}', '2026-01-02'),
  ('${W.team}', '공동 팀', '${U.A}', '{}', '2026-01-03'),
  ('${W.other}', '다른 사람 팀', '${U.D}', '{}', '2026-01-04'),
  ('${W.team2}', '공동 팀 2', '${U.A}', '{}', '2026-01-05');
INSERT INTO members (workspace_id, user_id, role, joined_at) VALUES
  ('${W.solo}', '${U.A}', 'owner', '2026-01-01'),
  ('${W.personal}', '${U.A}', 'owner', '2026-01-02'),
  ('${W.team}', '${U.A}', 'owner', '2026-01-03'),
  ('${W.team}', '${U.C}', 'editor', '2026-01-04'),
  ('${W.team}', '${U.B}', 'host', '2026-02-01'),
  ('${W.other}', '${U.D}', 'owner', '2026-01-04'),
  ('${W.other}', '${U.A}', 'editor', '2026-01-05'),
  ('${W.team2}', '${U.A}', 'owner', '2026-01-05'),
  ('${W.team2}', '${U.C}', 'editor', '2026-03-01'),
  ('${W.team2}', '${U.E}', 'editor', '2026-01-15');

INSERT INTO projects (id, workspace_id, title, status, created_by, created_at) VALUES
  ('${P.solo1}', '${W.solo}', '혼자 1', 'active', NULL, '2026-01-01'),
  ('${P.solo2}', '${W.solo}', '혼자 2', 'active', NULL, '2026-01-02'),
  ('${P.personal}', '${W.personal}', '[시뮬레이션] 개인 연습', 'simulation', '${U.A}', '2026-01-03'),
  ('${P.team}', '${W.team}', '팀 수업', 'active', NULL, '2026-01-04'),
  ('${P.simA}', '${W.team}', '[시뮬레이션] 탈퇴자 연습', 'simulation', '${U.A}', '2026-01-05'),
  ('${P.simB}', '${W.team}', '[시뮬레이션] 팀원 연습', 'simulation', '${U.B}', '2026-01-06'),
  ('${P.other}', '${W.other}', '다른 팀 수업', 'active', NULL, '2026-01-07'),
  ('${P.team2}', '${W.team2}', '팀 수업 2', 'active', '${U.A}', '2026-01-08');

INSERT INTO messages (project_id, user_id, sender_type, content, sender_name, sender_subject) VALUES
  ('${P.solo1}', '${U.A}', 'teacher', '혼자 쓴 메시지', '송선생', '정보'),
  ('${P.solo1}', NULL, 'ai', '혼자 받은 답', NULL, NULL),
  ('${P.team}', '${U.A}', 'teacher', '저는 정보 송선생입니다', '송선생', '정보'),
  ('${P.team}', '${U.B}', 'teacher', '저는 비교사입니다', '비교사', '수학'),
  ('${P.team}', NULL, 'ai', '송선생님 말씀처럼 진행합니다', NULL, NULL),
  ('${P.simB}', '${U.A}', 'teacher', '복제된 탈퇴자 메시지', '송선생', '정보'),
  ('${P.other}', '${U.A}', 'teacher', '다른 팀에서 쓴 메시지', '송선생', '정보'),
  ('${P.other}', '${U.D}', 'teacher', '디교사 메시지', '디교사', '과학'),
  ('${P.team2}', '${U.C}', 'teacher', '씨교사 메시지', '씨교사', '국어');

INSERT INTO designs (id, project_id, procedure_code, content, last_editor_id) VALUES
  ('${id('30000000', 1)}', '${P.solo1}', 'T-1-1', '{"a":1}', '${U.A}'),
  ('${id('30000000', 2)}', '${P.team}', 'T-2-1', '${ROLES_TEXT}', '${U.A}'),
  ('${id('30000000', 3)}', '${P.team}', 'T-1-1', '{"b":2}', '${U.B}');
INSERT INTO versions (design_id, snapshot, trigger_type, created_by) VALUES
  ('${id('30000000', 1)}', '{}', 'manual_save', '${U.A}'),
  ('${id('30000000', 2)}', '{}', 'manual_save', '${U.A}');
INSERT INTO comments (design_id, section_key, user_id, body, resolved, resolved_by) VALUES
  ('${id('30000000', 2)}', 'roles', '${U.A}', '역할 확인 부탁', true, '${U.B}'),
  ('${id('30000000', 3)}', 'vision', '${U.B}', '좋아요', true, '${U.A}');
INSERT INTO activity_logs (project_id, user_id, action_type) VALUES
  ('${P.solo1}', '${U.A}', 'edit'), ('${P.team}', '${U.A}', 'edit'), ('${P.team}', '${U.A}', 'ai_accept'), ('${P.team}', '${U.B}', 'edit');

INSERT INTO curriculum_standards (id, code, key, subject, content) VALUES
  ('${id('40000000', 1)}', '[9정01-01]', '[9정01-01]', '정보', '성취기준 1'),
  ('${id('40000000', 2)}', '[9수01-01]', '[9수01-01]', '수학', '성취기준 2');
INSERT INTO project_standards (project_id, standard_id, added_by) VALUES
  ('${P.solo1}', '${id('40000000', 1)}', '${U.A}'),
  ('${P.team}', '${id('40000000', 1)}', '${U.A}'),
  ('${P.team}', '${id('40000000', 2)}', '${U.B}');
INSERT INTO project_procedure_skips (project_id, procedure_code, skipped_by) VALUES
  ('${P.team}', 'T-2-2', '${U.A}');
INSERT INTO materials (project_id, session_id, uploader_id, file_name, storage_path) VALUES
  ('${P.solo1}', '${P.solo1}', '${U.A}', 'a.pdf', 'materials/${P.solo1}/x.pdf'),
  ('${P.team}', '${P.team}', '${U.A}', 'b.pdf', 'materials/${P.team}/y.pdf');
INSERT INTO invites (workspace_id, email, role, token, expires_at, created_by) VALUES
  ('${W.team}', 'new@school.kr', 'editor', 'tok-team', now() + interval '7 days', '${U.A}'),
  ('${W.other}', 'leaver@school.kr', 'editor', 'tok-to-leaver', now() + interval '7 days', '${U.D}');
INSERT INTO curriculum_links (source_code, target_code, link_type, status, reviewed_by) VALUES
  ('[9수01-01]', '[9정01-01]', 'cross_subject', 'published', '${U.A}');
INSERT INTO link_reports (source_code, target_code, reporter_id) VALUES ('[9수01-01]', '[9정01-01]', '${U.A}');
INSERT INTO simulation_runs (user_id, request_id, scope, status) VALUES
  ('${U.A}', gen_random_uuid(), 'qa:a', 'succeeded'), ('${U.B}', gen_random_uuid(), 'qa:b', 'succeeded');
-- 00030(ai_usage) 대역: 함수가 테이블 유무를 보고 처리하는지 확인
CREATE TABLE ai_usage (id bigserial PRIMARY KEY, user_id uuid, route text);
INSERT INTO ai_usage (user_id, route) VALUES ('${U.A}', 'chat'), ('${U.A}', 'chat'), ('${U.B}', 'chat');
`

const SNAPSHOT_TABLES = ['users', 'workspaces', 'members', 'projects', 'designs', 'versions', 'messages', 'comments',
  'activity_logs', 'materials', 'invites', 'project_standards', 'project_procedure_skips', 'simulation_runs',
  'ai_usage', 'curriculum_links', 'link_reports']
const snapshot = () => json(`SELECT jsonb_object_agg(t, h) FROM (${SNAPSHOT_TABLES.map((t) =>
  `SELECT '${t}' AS t, md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM ${t} x`).join(' UNION ALL ')}) s`)

function prepare(file, sql) {
  if (file.startsWith('00010_')) {
    return sql.replace(/CREATE EXTENSION IF NOT EXISTS vector;/i, '').replace(/VECTOR\(1536\)/gi, 'TEXT')
  }
  return sql
}

function applyMigrations(filter) {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort().filter(filter)
  for (const f of files) psql(prepare(f, fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')))
  return files
}

try {
  if (!fs.existsSync(bin('initdb'))) throw new Error(`Postgres 바이너리가 없습니다: ${PG_BIN} (PG_BIN으로 지정)`)
  let r = run(bin('initdb'), ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale'])
  if (r.status !== 0) throw new Error(r.stderr)
  const logFile = path.join(tmp, 'pg.log')
  r = run(bin('pg_ctl'), ['-D', dataDir, '-l', logFile, '-o', `-k ${tmp} -c listen_addresses='' -p ${port}`, '-w', 'start'])
  if (r.status !== 0) throw new Error(`${r.stderr || r.stdout}\n${fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''}`)
  started = true

  psql(BOOTSTRAP)
  const before = applyMigrations((f) => f < TARGET)
  console.log(`적용: ${before[0]} ~ ${before.at(-1)} (${before.length}개)`)
  psql(SEED)

  // ── 1. 수정 전: 사용자 삭제가 외래 키에 막힌다 (문제 재현) ──
  const blocked = psql(`DELETE FROM auth.users WHERE id = '${U.C}';`, { expectError: true })
  check(/foreign key/i.test(blocked), '00031 전: 팀원 계정을 지우면 NO ACTION 외래 키가 삭제를 막는다')

  // ── 2. 00031 적용 ──
  applyMigrations((f) => f === TARGET)
  const rules = json(`SELECT jsonb_object_agg(conrelid::regclass::text || '.' || a.attname, confdeltype)
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass`)
  const setNull = ['messages.user_id', 'comments.user_id', 'comments.resolved_by', 'activity_logs.user_id',
    'designs.last_editor_id', 'versions.created_by', 'project_standards.added_by', 'project_procedure_skips.skipped_by',
    'invites.created_by', 'curriculum_links.reviewed_by', 'materials.uploader_id', 'projects.created_by', 'link_reports.reporter_id']
  check(setNull.every((k) => rules[k] === 'n'), '계정 연결 외래 키 13개가 ON DELETE SET NULL')
  check(rules['members.user_id'] === 'c' && rules['workspaces.owner_id'] === 'a', '멤버십은 CASCADE, 워크스페이스 소유자는 NO ACTION(안전장치)')
  const rerunMigration = applyMigrations((f) => f === TARGET)
  check(rerunMigration.length === 1, '00031을 두 번 적용해도 오류 없음(멱등)')

  // ── 3. 실행 권한: service_role만 ──
  for (const role of ['anon', 'authenticated']) {
    const denied = psql(`SELECT delete_account_data('${U.A}', true);`, { role, expectError: true })
    check(/permission denied/i.test(denied), `${role} 역할은 탈퇴 함수를 실행할 수 없다`)
  }

  // ── 4. 시험 실행: 결과는 돌려주고 데이터는 그대로 ──
  const snap0 = snapshot()
  const plan = json(`SELECT delete_account_data('${U.A}');`, { role: 'service_role' })
  check(plan.dry_run === true && plan.found === true, '기본값은 시험 실행')
  check(JSON.stringify(snapshot()) === JSON.stringify(snap0), '시험 실행 뒤 모든 테이블 내용이 그대로')

  // ── 5. 실제 실행 ──
  const result = json(`SELECT delete_account_data('${U.A}', false);`, { role: 'service_role' })
  const { dry_run: _d1, ...planBody } = plan
  const { dry_run: _d2, ...resultBody } = result
  check(JSON.stringify(planBody) === JSON.stringify(resultBody), '시험 실행 결과와 실제 실행 결과가 같다')

  const deletedWs = result.workspaces_deleted.map((w) => w.id).sort()
  check(JSON.stringify(deletedWs) === JSON.stringify([W.solo, W.personal].sort()), '혼자 쓰던 곳과 개인 워크스페이스만 삭제')
  check(Number(scalar(`SELECT count(*) FROM workspaces WHERE id IN ('${W.solo}', '${W.personal}')`)) === 0, '삭제된 워크스페이스 행이 없다')
  check(Number(scalar(`SELECT count(*) FROM projects WHERE id IN ('${P.solo1}', '${P.solo2}', '${P.personal}')`)) === 0
    && Number(scalar(`SELECT count(*) FROM messages WHERE project_id = '${P.solo1}'`)) === 0
    && Number(scalar(`SELECT count(*) FROM materials WHERE project_id = '${P.solo1}'`)) === 0,
  '삭제된 워크스페이스의 프로젝트·메시지·자료 행도 함께 삭제')

  const transfer = Object.fromEntries(result.workspaces_transferred.map((t) => [t.id, t]))
  check(transfer[W.team]?.new_owner_id === U.B && transfer[W.team]?.previous_role === 'host', '공동 팀은 늦게 합류했어도 host에게 먼저 이관')
  check(transfer[W.team2]?.new_owner_id === U.E, '같은 editor끼리는 먼저 합류한 사람에게 이관')
  check(scalar(`SELECT owner_id FROM workspaces WHERE id = '${W.team}'`) === U.B
    && scalar(`SELECT role FROM members WHERE workspace_id = '${W.team}' AND user_id = '${U.B}'`) === 'owner'
    && scalar(`SELECT role FROM members WHERE workspace_id = '${W.team}' AND user_id = '${U.C}'`) === 'editor',
  '이관받은 사람의 멤버 역할이 owner, 다른 팀원 역할은 그대로')

  check(result.simulation_projects_deleted === 1
    && Number(scalar(`SELECT count(*) FROM projects WHERE id = '${P.simA}'`)) === 0
    && Number(scalar(`SELECT count(*) FROM projects WHERE id = '${P.simB}'`)) === 1,
  '팀 워크스페이스의 탈퇴자 시뮬레이션만 삭제, 팀원 시뮬레이션은 유지')
  check(JSON.stringify([...result.deleted_project_ids].sort()) === JSON.stringify([P.solo1, P.solo2, P.personal, P.simA].sort()),
    'Storage 정리 대상 프로젝트 목록이 정확')
  check(Number(scalar(`SELECT count(*) FROM projects WHERE id = '${P.team2}' AND created_by IS NULL`)) === 1,
    '시뮬레이션이 아닌 프로젝트는 생성자만 지우고 유지')

  const teamMsg = json(`SELECT row_to_json(m) FROM (SELECT user_id, sender_name, sender_subject, content FROM messages
    WHERE project_id = '${P.team}' AND content = '저는 정보 송선생입니다') m`)
  check(teamMsg.user_id === null && teamMsg.sender_name === '송선생' && teamMsg.sender_subject === '정보',
    '팀 메시지는 계정 연결만 끊기고 보낸 사람 이름·교과는 원본 그대로')
  check(scalar(`SELECT content FROM messages WHERE project_id = '${P.team}' AND sender_type = 'ai'`) === '송선생님 말씀처럼 진행합니다',
    'AI 답 속 이름도 원본 그대로')
  check(Number(scalar(`SELECT count(*) FROM messages WHERE project_id = '${P.other}' AND user_id IS NULL AND sender_name = '송선생'`)) === 1
    && scalar(`SELECT user_id FROM messages WHERE project_id = '${P.other}' AND sender_name = '디교사'`) === U.D,
  '탈퇴자가 멤버였던 다른 팀의 메시지도 남고 다른 교사 메시지는 무변경')
  check(scalar(`SELECT content = '${ROLES_TEXT}'::jsonb FROM designs WHERE id = '${id('30000000', 2)}'`) === 't'
    && scalar(`SELECT last_editor_id IS NULL FROM designs WHERE id = '${id('30000000', 2)}'`) === 't',
  '보드 내용은 원본 그대로, 마지막 편집자만 비움')
  check(scalar(`SELECT user_id IS NULL AND resolved_by = '${U.B}' FROM comments WHERE section_key = 'roles'`) === 't'
    && scalar(`SELECT user_id = '${U.B}' AND resolved_by IS NULL FROM comments WHERE section_key = 'vision'`) === 't',
  '댓글 작성자·해결자 중 탈퇴자 쪽만 비움')
  check(Number(scalar(`SELECT count(*) FROM activity_logs WHERE project_id = '${P.team}' AND user_id IS NULL`)) === 2
    && Number(scalar(`SELECT count(*) FROM activity_logs WHERE project_id = '${P.team}' AND user_id = '${U.B}'`)) === 1,
  '활동 로그 행은 남고 탈퇴자 연결만 비움')
  check(scalar(`SELECT bool_and(created_by IS NULL) FROM versions`) === 't'
    && scalar(`SELECT added_by IS NULL FROM project_standards WHERE project_id = '${P.team}' AND standard_id = '${id('40000000', 1)}'`) === 't'
    && scalar(`SELECT skipped_by IS NULL FROM project_procedure_skips WHERE project_id = '${P.team}'`) === 't'
    && scalar(`SELECT uploader_id IS NULL FROM materials WHERE project_id = '${P.team}'`) === 't'
    && scalar(`SELECT reviewed_by IS NULL FROM curriculum_links`) === 't'
    && scalar(`SELECT reporter_id IS NULL FROM link_reports`) === 't',
  '버전·성취기준 추가자·생략 결정자·업로더·링크 검토자·신고자 연결 비움')
  check(scalar(`SELECT created_by IS NULL FROM invites WHERE token = 'tok-team'`) === 't'
    && Number(scalar(`SELECT count(*) FROM invites WHERE token = 'tok-to-leaver'`)) === 0 && result.invites_deleted === 1,
  '팀이 보낸 초대는 남기고, 탈퇴자 이메일(대소문자 무관)로 온 초대는 삭제')
  check(Number(scalar(`SELECT count(*) FROM simulation_runs WHERE user_id = '${U.A}'`)) === 0
    && Number(scalar(`SELECT count(*) FROM simulation_runs WHERE user_id = '${U.B}'`)) === 1,
  '시뮬레이션 실행 기록은 탈퇴자 것만 삭제')
  check(Number(scalar(`SELECT count(*) FROM ai_usage WHERE user_id IS NULL`)) === 2 && result.ai_usage_unlinked === 2
    && Number(scalar(`SELECT count(*) FROM ai_usage`)) === 3,
  'AI 사용량 행은 남기고 탈퇴자 연결만 비움')
  check(result.memberships_removed === 3 && Number(scalar(`SELECT count(*) FROM members WHERE user_id = '${U.A}'`)) === 0,
    '남은 멤버십 3개 삭제')
  check(result.kept_unlinked.messages === 3 && result.kept_unlinked.activity_logs === 2 && result.kept_unlinked.comments === 2,
    '계정 연결만 끊긴 팀 기록 건수 보고')
  check(Number(scalar(`SELECT count(*) FROM users WHERE id = '${U.A}'`)) === 0, '프로필 삭제')

  // ── 6. auth 계정 삭제와 안전장치 ──
  psql(`DELETE FROM auth.users WHERE id = '${U.A}';`)
  check(Number(scalar(`SELECT count(*) FROM auth.users WHERE id = '${U.A}'`)) === 0, 'DB 처리 뒤 auth 계정 삭제 성공')
  psql(`DELETE FROM auth.users WHERE id = '${U.C}';`)
  check(Number(scalar(`SELECT count(*) FROM members WHERE user_id = '${U.C}'`)) === 0
    && scalar(`SELECT user_id IS NULL AND sender_name = '씨교사' FROM messages WHERE content = '씨교사 메시지'`) === 't',
  '소유한 곳이 없는 팀원은 auth 계정만 지워도 막히지 않는다(00031 효과)')
  const guard = psql(`DELETE FROM auth.users WHERE id = '${U.D}';`, { expectError: true })
  check(/workspaces_owner_id_fkey/.test(guard), '소유 워크스페이스가 남은 계정은 auth 삭제가 막힌다(안전장치)')

  // ── 7. 다시 실행해도 안전 ──
  const again = json(`SELECT delete_account_data('${U.A}', false);`, { role: 'service_role' })
  check(again.found === false && again.workspaces_deleted.length === 0 && again.deleted_project_ids.length === 0,
    '이미 처리한 계정을 다시 실행하면 아무것도 바꾸지 않는다')
  check(scalar(`SELECT count(*) FROM pg_proc WHERE proname = 'delete_account_data' AND prosecdef`) === '0',
    '함수는 호출자 권한(SECURITY INVOKER)으로 실행')

  console.log(`\n${checks}개 검증 통과`)
} finally {
  if (started) run(bin('pg_ctl'), ['-D', dataDir, '-m', 'immediate', 'stop'])
  fs.rmSync(tmp, { recursive: true, force: true })
}
