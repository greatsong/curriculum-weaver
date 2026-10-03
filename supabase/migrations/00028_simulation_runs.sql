-- 시뮬레이션 작업 예약·한도·복구의 DB 정본. service_role 서버에서만 접근.
CREATE TABLE IF NOT EXISTS public.simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  scope text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  deadline timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  UNIQUE (user_id, request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS simulation_runs_active_scope ON public.simulation_runs(scope) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS simulation_runs_user_day ON public.simulation_runs(user_id, created_at);
ALTER TABLE public.simulation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.simulation_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.simulation_runs TO service_role;

CREATE OR REPLACE FUNCTION public.expire_simulation_runs() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH expired AS (
    UPDATE simulation_runs SET status = 'failed'
    WHERE status = 'running' AND (lease_until <= now() OR deadline <= now()) RETURNING project_id
  )
  UPDATE projects SET status = 'failed', updated_at = now()
  WHERE id IN (SELECT project_id FROM expired) AND status = 'generating';
  GET DIAGNOSTICS n = ROW_COUNT;
  -- 도입 전 프로세스 중단으로 남은 작업. 오래된 생성 중 데이터만 실패로 복구한다.
  UPDATE projects p SET status = 'failed', updated_at = now()
  WHERE p.status = 'generating' AND p.updated_at < now() - interval '30 minutes'
    AND NOT EXISTS (SELECT 1 FROM simulation_runs r WHERE r.project_id = p.id);
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.claim_simulation_run(p_user uuid, p_request uuid, p_scope text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r simulation_runs; used integer;
BEGIN
  -- 예약과 일일 한도 소비를 짧은 한 트랜잭션으로 직렬화한다(여러 서버/탭 공통).
  PERFORM pg_advisory_xact_lock(731528461);
  PERFORM expire_simulation_runs();
  SELECT * INTO r FROM simulation_runs WHERE user_id = p_user AND request_id = p_request;
  IF FOUND AND r.scope <> p_scope THEN RETURN jsonb_build_object('kind','conflict'); END IF;
  IF FOUND THEN RETURN jsonb_build_object('kind','existing','id',r.id,'projectId',r.project_id,'status',r.status); END IF;
  SELECT * INTO r FROM simulation_runs WHERE scope = p_scope AND status = 'running';
  IF FOUND THEN RETURN jsonb_build_object('kind','busy','projectId',r.project_id,'status',r.status); END IF;
  SELECT count(*) INTO used FROM simulation_runs WHERE user_id = p_user
    AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  IF used >= 10 THEN RETURN jsonb_build_object('kind','quota'); END IF;
  INSERT INTO simulation_runs(user_id,request_id,scope) VALUES(p_user,p_request,p_scope) RETURNING * INTO r;
  RETURN jsonb_build_object('kind','claimed','id',r.id);
END $$;

CREATE OR REPLACE FUNCTION public.touch_simulation_run(p_id uuid, p_project uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE simulation_runs SET lease_until = LEAST(now() + interval '5 minutes', deadline), project_id = COALESCE(p_project, project_id)
  WHERE id = p_id AND status = 'running' AND lease_until > now() AND deadline > now();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.finish_simulation_run(p_id uuid, p_success boolean, p_procedure text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  UPDATE simulation_runs SET status = CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END
  WHERE id = p_id AND status = 'running' AND (NOT p_success OR (lease_until > now() AND deadline > now())) RETURNING project_id INTO pid;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE projects SET status = CASE WHEN p_success THEN 'simulation' ELSE 'failed' END,
    current_procedure = CASE WHEN p_success THEN COALESCE(p_procedure, current_procedure) ELSE current_procedure END, updated_at = now()
  WHERE id = pid AND status = 'generating';
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.expire_simulation_runs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_simulation_run(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_simulation_run(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_simulation_run(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_simulation_runs() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_simulation_run(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_simulation_run(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_simulation_run(uuid,boolean,text) TO service_role;
