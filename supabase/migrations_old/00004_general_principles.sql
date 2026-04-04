-- ============================================================
-- 00004: 총괄 원리 테이블 + 기존 가상 원리 비활성화
-- ============================================================

-- 총괄 원리 테이블 (Layer 1)
CREATE TABLE general_principles (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER general_principles_updated_at BEFORE UPDATE ON general_principles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 총괄 원리 지침 테이블
CREATE TABLE general_principle_guidelines (
  id              TEXT PRIMARY KEY,
  principle_id    TEXT NOT NULL REFERENCES general_principles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gpg_principle ON general_principle_guidelines(principle_id);

-- ============================================================
-- RLS 정책 (공개 읽기, 관리자 쓰기)
-- ============================================================
ALTER TABLE general_principles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gp_public_read" ON general_principles
  FOR SELECT USING (true);

CREATE POLICY "gp_admin_all" ON general_principles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE general_principle_guidelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gpg_public_read" ON general_principle_guidelines
  FOR SELECT USING (true);

CREATE POLICY "gpg_admin_all" ON general_principle_guidelines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 기존 가상 40개 원리 비활성화
-- ============================================================
UPDATE design_principles SET is_active = false
WHERE id LIKE 'P%';

-- ============================================================
-- 총괄 원리 시드 데이터
-- ============================================================
INSERT INTO general_principles (id, name, description, sort_order) VALUES
('GP01', '상호 의존의 원리', '목적(비전)을 공유하고 서로에 대한 신뢰를 바탕으로 설계팀을 형성한다.', 1),
('GP02', '인지 분산의 원리', '설계팀원들의 인지를 사회적·물리적으로 분산한다.', 2),
('GP03', '활성화의 원리', '설계과정에서 설계팀 구성원들이 아이디어 생성을 활성화한다.', 3),
('GP04', '외현화의 원리', '설계팀 구성원들의 지식을 시각적으로 표상하고 공유한다.', 4),
('GP05', '조정의 원리', '설계팀 구성원들이 표현한 지식(생각)들을 통합 및 보완한다.', 5);

INSERT INTO general_principle_guidelines (id, principle_id, content, sort_order) VALUES
('GP01-G1', 'GP01', '설계팀의 궁극적인 목적(비전)을 설정하고 공유하라.', 1),
('GP01-G2', 'GP01', '설계팀 구성원들은 상호 간에 편안하고 안전하다고 믿을 정도로 서로 간에 신뢰를 형성하라.', 2),
('GP01-G3', 'GP01', '설계팀 초기에 팀 구성원들의 인적 특성을 파악하고 공유하라.', 3),
('GP02-G1', 'GP02', '새로운 활동을 시작하기 전에 촉진자를 비롯하여 설계팀 구성원에게 적절한 역할(권한)을 부여하라.', 1),
('GP02-G2', 'GP02', '협력적 수업 설계 활동을 지원하는 인공물을 배치하고 활용하라.', 2),
('GP03-G1', 'GP03', '구성원들이 설계 전 과정에서 자유롭게 발언하도록 하라.', 1),
('GP03-G2', 'GP03', '교사들이 자유롭게 협력적 수업 설계할 시간과 공간을 확보하라.', 2),
('GP04-G1', 'GP04', '설계 팀 구성원들은 다른 사람들에게 자신의 내적인 인지(생각)를 외부적으로 표현하라.', 1),
('GP04-G2', 'GP04', '설계과정에서 팀원들이 표현한 개념, 관점, 행동들 중 명확하지 않은 부분에 대해 질문하라.', 2),
('GP05-G1', 'GP05', '구성원들의 다양한 의견들을 조직화하거나 논증함으로써 통합하라.', 1),
('GP05-G2', 'GP05', '협력적 수업설계과정에서 도출된 구성원들의 아이디어와 산출물들을 목표와 비교하여 주기적으로 조정하라.', 2),
('GP05-G3', 'GP05', '협력적 수업설계과정에서 상대방의 아이디어와 산출물들에 대해 교사 상호간 기술적(descriptive)이고 구체적인 피드백을 제공하라.', 3),
('GP05-G4', 'GP05', '협력적 수업 설계과정에서 설계팀이 결정한 내용들을 전체 구성원들과 공유하고 개별 팀원들의 설계활동을 스스로 조정하라.', 4);
