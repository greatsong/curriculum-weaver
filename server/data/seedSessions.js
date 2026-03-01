/**
 * 모범 시드 세션 데이터 — 초/중/고 3개 세션
 * 각 세션: 10단계 보드 + 모범 채팅 기록 포함
 */

export const SEED_SESSIONS = [
  // ─── 1. 초등학교 ───
  {
    title: '[샘플] 우리 마을 생태 지도 만들기',
    description: '초등학교 5학년 과학(생태계)+미술(시각디자인)+실과(SW 기초) 융합 수업. 학교 주변 생태를 관찰·기록하고, 디지털 도구로 우리 마을 생태 지도를 제작하여 전시합니다.',
    boards: {
      1: {
        team_vision: {
          vision: '학생들이 학교 주변 생태를 직접 관찰하고 기록하며, 디지털 도구를 활용해 우리 마을 생태 지도를 제작하여 생태 감수성과 환경 보전 의식을 키운다.',
          design_direction: '과학(생태계)·미술(시각디자인)·실과(SW 기초) 3개 교과를 연결하여, 야외 관찰→기록→디지털 지도 제작→전시의 흐름으로 프로젝트를 설계한다.',
          target_students: '초등학교 5학년 (만 10~11세)',
          subjects_involved: ['과학', '미술', '실과'],
        },
        collaboration_agreement: {
          communication_method: '카카오톡 단체방 + 주 1회 대면 회의 (화요일 점심시간)',
          meeting_frequency: '주 1회 짧은 대면 회의(20분) + 필요 시 카톡 비동기 소통',
          decision_method: '합의제, 담임교사(과학) 의견 우선 존중',
          agreements: [
            '야외 활동 시 안전을 최우선으로 고려한다',
            '학생 눈높이에 맞는 쉬운 용어를 사용한다',
            '활동 자료는 공유 드라이브에 수업 전일까지 업로드',
            '야외 수업 시 보조 인력(학부모 봉사) 2명 이상 확보',
          ],
        },
      },
      2: {
        team_roles: {
          members: [
            { name: '윤서영', subject: '과학(담임)', role: '생태 관찰·탐구 활동 설계 (팀장)', strength: '생태 교육, 야외 체험학습 운영 경험 풍부' },
            { name: '장민혁', subject: '미술', role: '시각 디자인·전시 기획 담당', strength: '시각디자인 전공, 학생 작품 전시 기획 경험' },
            { name: '고은지', subject: '실과', role: 'SW·디지털 도구 지도 담당', strength: '엔트리 교육, 디지털 리터러시 수업 경험' },
          ],
        },
        team_schedule: {
          milestones: [
            { phase: 'T (준비)', task: '팀 구성 및 야외 활동 안전 계획', deadline: '1주차', responsible: '전체' },
            { phase: 'A (분석)', task: '주제 선정·교육과정 분석', deadline: '2주차', responsible: '전체' },
            { phase: 'Ds (설계)', task: '10차시 수업 설계·평가 계획', deadline: '3주차', responsible: '전체' },
            { phase: 'DI (개발)', task: '관찰 기록지·디지털 도구 준비', deadline: '4주차', responsible: '교과별' },
            { phase: 'DI (실행)', task: '수업 실행 (10차시)', deadline: '5~8주차', responsible: '교과별' },
            { phase: 'E (평가)', task: '전시회 개최 및 종합 성찰', deadline: '9주차', responsible: '전체' },
          ],
          ground_rules: [
            '야외 활동은 반드시 2명 이상의 교사가 동행한다',
            '식물·곤충 채집은 하지 않고 관찰·촬영만 한다',
            '학생 사진은 학부모 동의를 받은 후에만 활용한다',
            '비 오는 날은 실내 대체 활동으로 전환',
          ],
        },
      },
      3: {
        topic_exploration: {
          main_topic: '우리 마을 생태 지도 만들기',
          sub_topics: ['학교 화단·숲 속 식물 관찰 지도', '학교 주변 곤충·새 서식지 지도', '계절별 생태 변화 기록 지도', '마을 하천·습지 생태 지도'],
          selection_criteria: ['학교 주변에서 안전하게 관찰할 수 있는 범위인가?', '5학년 수준에서 직접 관찰·기록이 가능한가?', '과학(생태)·미술(디자인)·실과(SW)가 자연스럽게 연결되는가?', '완성작을 전시하여 학교 구성원과 공유할 수 있는가?'],
          life_connection: '학생들이 매일 지나다니는 학교와 마을에 어떤 생물들이 살고 있는지 직접 관찰하면서, 자연과 공존하는 삶의 가치를 체감한다.',
          rationale: '5학년 과학 교육과정에 생태계 단원이 포함되어 있고, 학교 주변이라는 친숙한 환경에서 실물 관찰이 가능하다.',
        },
        inquiry_questions: {
          essential_question: '우리 학교 주변에는 어떤 생물들이 살고 있으며, 우리는 이 생태계를 어떻게 지키고 알릴 수 있을까?',
          sub_questions: ['학교 화단과 주변 숲에는 어떤 식물과 동물이 살고 있을까?', '생물들은 왜 특정 장소에서 살까?', '관찰한 생태 정보를 어떻게 아름답고 정확하게 표현할 수 있을까?', '디지털 도구를 사용하면 생태 지도를 어떻게 더 효과적으로 만들 수 있을까?'],
          student_perspective: '학생들은 매일 등하교하면서 주변 자연을 무심히 지나치지만, 직접 관찰하면 놀라울 정도로 다양한 생물이 있다는 것을 발견하게 된다.',
        },
      },
      4: {
        standard_mapping: {
          mappings: [
            { subject: '과학', code: '[6과12-01]', content: '생태계의 구성 요소와 환경 요인이 생물에 미치는 영향을 이해한다', connection: '학교 주변 생태계 구성 요소 직접 관찰·기록' },
            { subject: '과학', code: '[6과12-03]', content: '생태계 보전의 필요성을 이해하고 보전 태도를 기른다', connection: '생태 지도 전시를 통한 환경 보전 메시지 전달' },
            { subject: '미술', code: '[6미02-04]', content: '조형 요소와 원리를 활용하여 시각적으로 효과적인 표현을 한다', connection: '생태 관찰 일러스트 및 지도 디자인' },
            { subject: '실과', code: '[6실04-07]', content: '소프트웨어가 적용된 사례를 탐색하고 간단한 프로그램을 만든다', connection: '엔트리로 인터랙티브 디지털 생태 지도 제작' },
          ],
          learning_objectives: [
            '학교 주변 생태계의 구성 요소를 관찰하고 생물과 환경의 관계를 설명할 수 있다',
            '관찰한 생물을 정확하고 아름답게 일러스트로 표현할 수 있다',
            '엔트리를 활용하여 인터랙티브 디지털 생태 지도를 만들 수 있다',
            '생태 지도 전시를 통해 생태계 보전의 메시지를 전달할 수 있다',
          ],
        },
        cross_subject_links: {
          big_idea: '관찰과 표현을 통해 자연과 공존하는 삶의 가치를 발견하는 생태 시민 역량',
          competencies: ['관찰력', '시각적 표현력', '디지털 리터러시', '생태 감수성', '협동 능력'],
          links: [
            { from_subject: '과학', from_standard: '생태계 관찰·이해', to_subject: '미술', to_standard: '조형 표현', rationale: '과학적 관찰 결과를 미술적으로 정확하고 아름답게 표현' },
            { from_subject: '미술', from_standard: '시각 디자인', to_subject: '실과', to_standard: 'SW 프로그래밍', rationale: '손그림 지도를 디지털 인터랙티브 지도로 확장' },
          ],
        },
      },
      5: {
        assessment_plan: {
          assessments: [
            { name: '생태 관찰 기록장', type: '과정 평가', timing: '3~5차시', target_standards: '[6과12-01]', method: '포트폴리오 (관찰 기록의 정확성·상세함)' },
            { name: '생물 일러스트', type: '수행평가', timing: '6차시', target_standards: '[6미02-04]', method: '산출물 평가 (표현력·정확성·심미성)' },
            { name: '디지털 생태 지도', type: '프로젝트 평가', timing: '8~9차시', target_standards: '[6실04-07]', method: '산출물 평가 (기능 구현·디자인·정보 정확성)' },
          ],
        },
        lesson_flow: {
          total_hours: 10,
          lessons: [
            { lesson_num: '1', title: '우리 학교에 누가 살고 있을까?', objective: '생태계 개념을 이해하고 관찰 계획을 세운다', activities: '생태계 개념 소개 → 학교 주변 생물 예상 목록 작성', standards: '[6과12-01]' },
            { lesson_num: '2', title: '관찰 탐험가 준비!', objective: '과학적 관찰 방법과 기록 방법을 배운다', activities: '관찰 도구 사용법 → 기록 방법 연습', standards: '[6과12-01]' },
            { lesson_num: '3-4', title: '학교 생태 탐험 (야외 관찰)', objective: '학교 주변 생물을 직접 관찰·기록·촬영한다', activities: '모둠별 구역 배정 → 관찰 → 기록장 작성', standards: '[6과12-01]' },
            { lesson_num: '5', title: '관찰 결과 정리와 공유', objective: '관찰 결과를 정리하고 모둠 간 공유한다', activities: '관찰 기록 정리 → 모둠별 발견 공유', standards: '[6과12-01]' },
            { lesson_num: '6', title: '생물 일러스트 그리기', objective: '관찰한 생물을 정확하고 아름답게 그린다', activities: '과학 일러스트 기법 → 일러스트 제작', standards: '[6미02-04]' },
            { lesson_num: '7', title: '종이 생태 지도 디자인', objective: '학교 주변 약도에 생태 정보를 배치한다', activities: '지도 레이아웃 → 일러스트 배치 → 범례', standards: '[6미02-04]' },
            { lesson_num: '8-9', title: '엔트리로 디지털 생태 지도 만들기', objective: '인터랙티브 디지털 지도를 만든다', activities: '엔트리 기초 → 지도 배경 → 스프라이트 → 이벤트 코딩', standards: '[6실04-07]' },
            { lesson_num: '10', title: '우리 마을 생태 지도 전시회', objective: '작품을 전시하고 보전 메시지를 전달한다', activities: '전시 준비 → 감상·질문 → 보전 다짐', standards: '[6과12-03]' },
          ],
        },
        core_activities: {
          activities: [
            { name: '학교 생태 탐험', description: '돋보기, 카메라, 기록장을 들고 학교 주변 생물을 관찰·기록하는 야외 활동', type: '야외 관찰', materials_needed: '돋보기, 태블릿, 관찰 기록장', expected_outcome: '모둠별 관찰 기록장 + 사진' },
            { name: '과학 일러스트 그리기', description: '관찰한 생물의 특징을 살려 과학적으로 정확하면서 아름다운 일러스트를 그리는 활동', type: '미술 표현', materials_needed: '도화지, 색연필, 참고 사진', expected_outcome: '생물 일러스트 개인 2장' },
            { name: '디지털 생태 지도 제작', description: '엔트리에서 클릭하면 생물 정보가 나오는 인터랙티브 지도를 만드는 활동', type: 'SW 코딩', materials_needed: '태블릿/PC, 엔트리', expected_outcome: '모둠별 디지털 생태 지도' },
          ],
        },
      },
      6: {
        teacher_roles: {
          roles: [
            { lesson_num: '1-2', lead_teacher: '윤서영(과학)', lead_role: '생태계 개념·관찰 방법 지도', support_teacher: '고은지(실과)', support_role: '태블릿 카메라 사용 지도' },
            { lesson_num: '3-4', lead_teacher: '윤서영(과학)', lead_role: '야외 관찰 총괄·안전 관리', support_teacher: '장민혁(미술), 고은지(실과)', support_role: '구역별 보조' },
            { lesson_num: '6-7', lead_teacher: '장민혁(미술)', lead_role: '일러스트·지도 디자인 지도', support_teacher: '윤서영(과학)', support_role: '생물 특징 정확성 검수' },
            { lesson_num: '8-9', lead_teacher: '고은지(실과)', lead_role: '엔트리 코딩 지도', support_teacher: '장민혁(미술)', support_role: '디자인 심미성 보조' },
            { lesson_num: '10', lead_teacher: '전체 공동', lead_role: '전시회 운영', support_teacher: '-', support_role: '교과별 평가' },
          ],
        },
        rubric: {
          criteria: [
            { criterion: '생태 관찰·기록', excellent: '생물의 특징을 상세히 관찰하고 서식 환경과의 관계를 설명함', good: '생물을 관찰하고 특징을 기록함', adequate: '관찰은 하였으나 기록이 부족함', needs_work: '관찰 활동에 소극적임' },
            { criterion: '일러스트 표현', excellent: '생물 특징을 정확하게 표현하고 색감·구도가 아름다움', good: '생물 특징이 드러나는 일러스트를 그림', adequate: '일러스트를 그렸으나 정확성이 부족함', needs_work: '일러스트를 완성하지 못함' },
            { criterion: '디지털 지도 제작', excellent: '인터랙티브 기능이 정확히 작동하고 정보가 풍부함', good: '클릭 기능이 작동하고 기본 정보가 포함됨', adequate: '지도를 만들었으나 기능이 불완전함', needs_work: '지도를 완성하지 못함' },
          ],
        },
        scaffolding: {
          strategies: [
            { activity: '생물 관찰', student_level: '하위', scaffold_type: '관찰 가이드 카드', description: '생물 종류별 관찰 포인트를 그림과 함께 제시', fade_plan: '두 번째 야외 활동부터 카드 없이 자유 관찰' },
            { activity: '엔트리 코딩', student_level: '전체', scaffold_type: '블록 코드 예시', description: '스프라이트 클릭 시 말풍선 보이기 예시 코드 제공', fade_plan: '기본 기능 완성 후 효과음·애니메이션 자유 추가' },
          ],
        },
      },
      7: {
        student_worksheets: { worksheets: [
          { title: '우리 학교 생물 예상 목록', lesson_num: '1', purpose: '사전 지식 활성화', instructions: '학교 주변에서 본 적 있는 식물, 곤충, 새를 적어보세요', format: '개인 활동지' },
          { title: '생태 관찰 기록장', lesson_num: '3-4', purpose: '체계적 관찰 기록', instructions: '발견한 생물의 이름, 위치, 특징, 서식 환경을 기록하세요', format: '모둠 관찰 기록장' },
          { title: '엔트리 코딩 미션카드', lesson_num: '8-9', purpose: '디지털 지도 제작 가이드', instructions: '미션별로 따라하며 인터랙티브 생태 지도를 완성하세요', format: '모둠 활동지' },
        ]},
        resource_list: { resources: [
          { name: '돋보기', category: '관찰 도구', quantity: '모둠당 2개', availability: '과학실 보유', alternative: '스마트폰 카메라 확대' },
          { name: '태블릿', category: '디지털 기기', quantity: '모둠당 2대', availability: '확보 완료', alternative: 'PC실' },
          { name: '식물·곤충 도감', category: '참고 자료', quantity: '모둠당 1권', availability: '도서관 대출', alternative: '네이버 식물도감' },
          { name: '도화지·색연필', category: '미술 재료', quantity: '학생 1인당', availability: '확보 완료', alternative: '-' },
        ]},
        digital_tools: { tools: [
          { name: '엔트리 (Entry)', purpose: '인터랙티브 디지털 생태 지도 제작', url: 'https://playentry.org', account_needed: '무료 계정', alternative: '스크래치' },
          { name: '네이버 식물도감', purpose: '관찰한 식물 종 확인', url: 'https://terms.naver.com/list.naver?cid=46696', account_needed: '불필요', alternative: '한국식물도감 앱' },
        ]},
      },
      8: {
        execution_timeline: { timeline: [
          { date: '3/11(화)', period: '3교시', lesson_num: '1', content: '생태계 개념·관찰 계획', room: '5-2 교실' },
          { date: '3/13(목)', period: '5교시', lesson_num: '2', content: '관찰 방법 연습', room: '5-2 교실' },
          { date: '3/18(화)', period: '3-4교시', lesson_num: '3-4', content: '야외 생태 탐험', room: '학교 주변(야외)' },
          { date: '3/25(화)', period: '3교시', lesson_num: '6', content: '생물 일러스트', room: '미술실' },
          { date: '4/1(화)', period: '3-4교시', lesson_num: '8-9', content: '엔트리 디지털 지도', room: '컴퓨터실' },
          { date: '4/3(목)', period: '5교시', lesson_num: '10', content: '전시회', room: '1층 로비' },
        ]},
        checklist: { items: [
          { category: '안전', item: '야외 활동 안전 계획서 제출', responsible: '윤서영', deadline: '3/14', checked: '완료' },
          { category: '안전', item: '학부모 봉사 2명 확보', responsible: '윤서영', deadline: '3/14', checked: '완료' },
          { category: '시설', item: '미술실 예약', responsible: '장민혁', deadline: '3/11', checked: '완료' },
          { category: '시설', item: '컴퓨터실 예약', responsible: '고은지', deadline: '3/11', checked: '완료' },
          { category: '자료', item: '엔트리 학생 계정 일괄 생성', responsible: '고은지', deadline: '3/28', checked: '진행 중' },
        ]},
        observation_log: { observations: [
          { lesson_num: '3-4', observer: '장민혁', focus: '야외 활동 참여도', findings: '학생들이 돋보기로 곤충을 관찰할 때 매우 집중함. 예상보다 많은 종류의 식물을 발견하여 놀라워함', suggestions: '관찰 시간을 2시간 블록으로 운영하면 좋겠음' },
        ]},
      },
      9: {
        formative_feedback: { feedback_items: [
          { phase: 'A (분석)', what_observed: '학생들이 생물 이름을 잘 모르는 경우 많음', feedback: '도감 활용법을 사전에 지도하고, 이름 모를 때는 특징으로 기록', action_taken: '"이름 모를 식물 기록법" 가이드 1장 추가 제작' },
          { phase: 'DI (실행)', what_observed: '엔트리 코딩에서 이벤트 블록 연결 어려움', feedback: '교사가 TV에 예시 코드를 띄워놓고 따라하기', action_taken: '미션카드에 블록 스크린샷 추가' },
        ]},
        stage_reflection: { reflections: [
          { phase: 'T (팀 준비)', what_worked: '야외 활동 안전 계획을 철저히 세운 덕분에 사고 없이 진행', what_didnt: '학부모 봉사 인력 확보에 시간이 걸림', lesson_learned: '학기 초에 미리 봉사 희망자를 확보' },
          { phase: 'DI (실행)', what_worked: '과학→미술→코딩의 흐름이 자연스러워 학생 몰입감 높음', what_didnt: '엔트리 코딩 시간이 2차시로 부족', lesson_learned: '디지털 도구 활동은 여유 있게 시간 배정' },
        ]},
      },
      10: {
        reflection_notes: {
          goal_achievement: '4개 학습 목표 모두 대체로 달성됨. 특히 야외 관찰 활동에서 학생들의 생태 감수성이 크게 향상되었음.',
          vision_alignment: '전시회에서 학생들이 다른 반 친구들에게 생태 지도를 설명하며 자부심을 느끼는 모습이 인상적.',
          student_growth: '사전-사후 설문에서 "학교 주변 자연에 관심이 있다"가 3.0→4.5점으로 크게 상승.',
          what_worked: ['야외 관찰이 학생 동기유발과 생태 감수성 함양에 매우 효과적', '과학→미술→코딩의 자연스러운 흐름', '전시회가 성과 공유의 좋은 기회'],
          what_didnt: ['10차시가 빠듯 — 12차시가 적절', '야외 활동 날씨 리스크', '생물 이름 확인에 시간 소요'],
        },
        improvements: { items: [
          { area: '차시 운영', current_issue: '10차시 빠듯', improvement: '12차시로 확대 (코딩 3차시 + 전시 준비 1차시)', priority: '높음' },
          { area: '야외 활동', current_issue: '날씨 변수', improvement: '우천 대비 실내 대체 활동 사전 준비', priority: '높음' },
          { area: '관찰 지도', current_issue: '생물 이름 확인 어려움', improvement: '학교 주변 주요 생물 20종 사진·이름 카드 제작', priority: '중간' },
        ]},
      },
    },
    chats: [
      { sender_type: 'teacher', content: '안녕하세요! 5학년 과학 담임 윤서영입니다. 생태계 단원과 미술, 실과를 융합한 프로젝트를 계획하고 있어요. 학교 주변 생태를 관찰하고 디지털 지도를 만드는 건 어떨까요?', stage: 1, sender_name: '윤서영', sender_subject: '과학' },
      { sender_type: 'ai', content: '좋은 아이디어입니다! "우리 마을 생태 지도 만들기"는 초등 5학년에게 매우 적합한 융합 주제예요.\n\n**강점:**\n- 학교 주변이라는 친숙한 공간에서 실물 관찰 가능\n- 과학(생태계)→미술(일러스트)→실과(엔트리 코딩)의 자연스러운 흐름\n- 전시회로 학습 성과를 공유하는 경험\n\n먼저 팀 구성부터 정리해볼까요? 함께 참여하실 선생님들은 어떤 교과를 담당하시나요?', stage: 1 },
      { sender_type: 'teacher', content: '미술 장민혁 선생님과 실과 고은지 선생님이 함께하기로 했어요. 장민혁 선생님은 시각디자인 전공이시고, 고은지 선생님은 엔트리 교육 경험이 있으세요.', stage: 1, sender_name: '윤서영', sender_subject: '과학' },
      { sender_type: 'ai', content: '3분의 전문성이 잘 맞네요! 역할을 이렇게 나누면 어떨까요?\n\n| 선생님 | 교과 | 역할 |\n|--------|------|------|\n| 윤서영 | 과학 | 생태 관찰·탐구 설계 (팀장) |\n| 장민혁 | 미술 | 일러스트·지도 디자인·전시 기획 |\n| 고은지 | 실과 | 엔트리 코딩·디지털 도구 지도 |\n\n야외 활동이 포함되니 **안전 계획**이 특히 중요합니다. 학부모 봉사 인력 확보도 미리 준비하시면 좋겠어요.\n\n팀 비전과 보드에 정리해 드릴까요?', stage: 1 },
      { sender_type: 'teacher', content: '네, 정리 부탁해요! 그리고 총 몇 차시가 적당할까요? 과학 4시간, 미술 4시간, 실과 2시간 정도 확보할 수 있을 것 같아요.', stage: 1, sender_name: '윤서영', sender_subject: '과학' },
      { sender_type: 'ai', content: '10차시면 충분히 의미 있는 프로젝트를 진행할 수 있어요! 이런 흐름을 제안합니다:\n\n**10차시 구성안:**\n1. 생태계 개념 도입 (과학 1h)\n2. 관찰 방법 연습 (과학 1h)\n3-4. 야외 생태 탐험 (과학 2h)\n5. 관찰 결과 정리·공유 (과학 1h, 여기까지 과학 5h → 4h로 조정 가능)\n6. 생물 일러스트 (미술 1h)\n7. 종이 지도 디자인 (미술 1h)\n8-9. 엔트리 디지털 지도 (실과 2h)\n10. 전시회 (미술 1h)\n\n5차시를 미술로 옮겨서 "관찰 결과를 시각적으로 정리"하는 활동으로 바꾸면 과학 4 + 미술 4 + 실과 2로 맞출 수 있어요.\n\n보드에 팀 비전과 차시 구성을 정리하겠습니다!', stage: 1 },
      { sender_type: 'teacher', content: '야외 관찰할 때 학생들이 생물 이름을 잘 모를 수 있는데, 어떻게 대비하면 좋을까요?', stage: 3, sender_name: '윤서영', sender_subject: '과학' },
      { sender_type: 'ai', content: '좋은 우려입니다! 초등학생이 모든 생물의 이름을 아는 것보다 **관찰하는 습관**이 더 중요하니까요. 이렇게 대비하면 좋겠어요:\n\n1. **"이름 모를 식물 기록법" 가이드** — 이름을 모르면 특징으로 기록 (예: "빨간 열매가 달린 키 작은 나무")\n2. **주요 생물 20종 사진 카드** — 학교 주변에서 흔히 볼 수 있는 식물·곤충을 사전에 조사해서 카드로 만들기\n3. **네이버 식물도감 앱 활용** — 사진을 찍으면 AI가 식물을 식별해주는 기능 활용\n4. **도감 사용법 사전 교육** — 2차시에 도감 사용법을 미리 연습\n\n완벽하게 이름을 맞히는 것보다, "꼼꼼하게 관찰하고 기록하는 태도"를 칭찬해주시면 학생들의 부담이 줄어들 거예요.', stage: 3 },
    ],
  },

  // ─── 2. 중학교 ───
  {
    title: '[샘플] 데이터 과학으로 만드는 지속가능한 우리 동네',
    description: '중학교 2학년 수학(통계)+사회(지리)+정보(데이터 분석) 융합 수업. 학생들이 우리 동네 환경 데이터를 수집·분석하여 지속가능한 도시 제안서를 작성하는 프로젝트 기반 학습입니다.',
    boards: {
      1: {
        team_vision: {
          vision: '학생들이 자신의 삶의 공간인 "우리 동네"를 데이터 기반으로 분석하고, 지속가능한 발전을 위한 구체적 제안을 할 수 있는 시민으로 성장하도록 돕는다.',
          design_direction: '수학(통계)·사회(지리)·정보(데이터 분석) 3개 교과를 연결하여, 실제 공공 데이터를 활용한 PBL로 설계한다.',
          target_students: '중학교 2학년 (만 13~14세)',
          subjects_involved: ['수학', '사회', '정보'],
        },
        collaboration_agreement: {
          communication_method: '카카오톡 단체방 + 주 1회 대면 회의 (수요일 4교시 후)',
          meeting_frequency: '주 1회 정기 회의 + 필요 시 비정기 온라인 회의',
          decision_method: '합의제 원칙, 교과 전문성 관련 사항은 해당 교사에게 위임',
          agreements: ['회의 전 각자 담당 부분 사전 준비하기', '서로의 교과 전문성을 존중하고 적극적으로 의견 제시하기', '학생 반응과 피드백을 공유 문서에 즉시 기록하기', '수업 자료는 공유 드라이브에 회의 1일 전까지 업로드하기'],
        },
      },
      2: {
        team_roles: {
          members: [
            { name: '김수연', subject: '수학', role: '데이터 분석 설계 담당', strength: '통계 교육, 엑셀·스프레드시트 활용' },
            { name: '박지호', subject: '사회', role: '주제 맥락·지역 연계 담당', strength: '지리 교육, 지역사회 연계 수업 경험' },
            { name: '이한결', subject: '정보', role: '디지털 도구·코딩 담당 (팀장)', strength: '파이썬 교육, 데이터 시각화 도구 활용' },
          ],
        },
        team_schedule: {
          milestones: [
            { phase: 'T (준비)', task: '팀 구성 및 협력 방식 합의', deadline: '1주차', responsible: '전체' },
            { phase: 'A (분석)', task: '주제 선정 및 성취기준 분석', deadline: '2주차', responsible: '전체' },
            { phase: 'Ds (설계)', task: '차시 구성 및 평가 계획', deadline: '3~4주차', responsible: '전체' },
            { phase: 'DI (실행)', task: '수업 실행 (12차시)', deadline: '5~8주차', responsible: '교과별' },
            { phase: 'E (평가)', task: '종합 성찰 및 개선안', deadline: '9주차', responsible: '전체' },
          ],
          ground_rules: ['수업 관련 의사결정은 반드시 3명이 함께 협의', '학생 개인정보 데이터는 비식별화 처리', '매 차시 수업 후 간단한 수업 일지 작성'],
        },
      },
      3: {
        topic_exploration: {
          main_topic: '데이터 과학으로 만드는 지속가능한 우리 동네',
          sub_topics: ['우리 동네 대기질(미세먼지) 변화 분석', '우리 동네 녹지율과 체감온도 관계', '우리 동네 교통 데이터로 보는 탄소 배출'],
          selection_criteria: ['학생 실생활과 직접 연결되는가?', '공공 데이터를 쉽게 구할 수 있는가?', '3교과가 자연스럽게 연결되는가?'],
          life_connection: '학생들이 매일 생활하는 동네의 환경 데이터를 직접 분석하여 "지속가능발전"을 자기 삶의 문제로 인식하게 된다.',
          rationale: '공공데이터포털에서 동네 단위 환경 데이터를 무료 제공하고 있어 접근성이 좋다.',
        },
        inquiry_questions: {
          essential_question: '우리 동네의 환경 데이터는 어떤 이야기를 하고 있으며, 우리는 데이터를 기반으로 어떤 변화를 만들 수 있을까?',
          sub_questions: ['우리 동네 환경 데이터는 어떤 패턴을 보이는가?', '데이터를 분석하는 데 어떤 통계적 방법이 필요한가?', '분석 결과를 바탕으로 어떤 제안을 할 수 있는가?'],
          student_perspective: '자기 동네 데이터를 직접 다루면서 환경 문제가 자기 삶에 직접 영향을 미치고 있음을 깨닫게 된다.',
        },
      },
      4: {
        standard_mapping: {
          mappings: [
            { subject: '수학', code: '[9수05-01]', content: '자료를 수집·정리하여 그래프로 나타낼 수 있다', connection: '환경 데이터를 표와 그래프로 정리' },
            { subject: '수학', code: '[9수05-03]', content: '평균, 중앙값, 최빈값을 구하고 자료 특성을 설명할 수 있다', connection: '환경 지표의 대표값 분석' },
            { subject: '사회', code: '[9사(지리)03-01]', content: '지리 정보 기술을 활용하여 지역 문제를 파악한다', connection: 'GIS 기반 환경 데이터 시각화' },
            { subject: '정보', code: '[9정04-02]', content: '실생활 자료를 구조화하고 분석할 수 있다', connection: '공공데이터 수집·전처리' },
            { subject: '정보', code: '[9정04-03]', content: '자료 분석 결과를 시각화할 수 있다', connection: '파이썬으로 데이터 시각화' },
          ],
          learning_objectives: ['환경 공공 데이터를 수집·정리하여 통계표와 그래프로 나타낼 수 있다', '대표값을 활용하여 환경 데이터의 특성을 분석할 수 있다', '데이터 분석 결과를 근거로 지속가능한 동네를 위한 제안서를 작성할 수 있다'],
        },
        cross_subject_links: {
          big_idea: '데이터 기반 의사결정으로 지역사회 문제를 해결하는 시민 역량',
          competencies: ['비판적 사고력', '데이터 리터러시', '의사소통 능력', '공동체 역량'],
          links: [
            { from_subject: '수학', from_standard: '통계적 자료 정리·분석', to_subject: '정보', to_standard: '데이터 구조화·시각화', rationale: '수학의 통계 개념을 프로그래밍으로 실현' },
            { from_subject: '정보', from_standard: '데이터 분석·시각화', to_subject: '사회', to_standard: '지속가능발전 실천', rationale: '시각화된 데이터를 근거로 제안서 작성' },
          ],
        },
      },
      5: {
        assessment_plan: { assessments: [
          { name: '데이터 분석 보고서', type: '과정·결과 통합', timing: '8~10차시', target_standards: '[9수05-01], [9정04-02]', method: '포트폴리오 평가' },
          { name: '데이터 시각화 차트', type: '수행평가', timing: '10~11차시', target_standards: '[9정04-03]', method: '산출물 평가' },
          { name: '지속가능 제안서', type: '프로젝트 평가', timing: '12차시', target_standards: '[9사03-01]', method: '루브릭 기반 동료+교사 평가' },
        ]},
        lesson_flow: {
          total_hours: 12,
          lessons: [
            { lesson_num: '1', title: '우리 동네, 데이터로 다시 보기', objective: '프로젝트 주제와 목표를 이해한다', activities: '동네 환경 사진 공유 → 브레인스토밍 → 탐구 질문 도출', standards: '[9사03-03]' },
            { lesson_num: '2', title: '데이터는 어디에? — 공공데이터 탐색', objective: '공공데이터포털에서 환경 데이터를 수집한다', activities: '포털 탐색 → 데이터 선별 → 팀별 수집', standards: '[9정04-02]' },
            { lesson_num: '3-4', title: '데이터 정리 — 표와 그래프의 힘', objective: '수집한 데이터를 통계표로 정리한다', activities: '데이터 전처리 → 도수분포표 → 히스토그램', standards: '[9수05-01]' },
            { lesson_num: '5-6', title: '숫자가 말하는 우리 동네', objective: '대표값으로 환경 데이터를 분석한다', activities: '대표값 계산 → 비교 토론 → 해석', standards: '[9수05-03]' },
            { lesson_num: '7-8', title: '동네 환경 지도 만들기', objective: '데이터를 지도 위에 시각화한다', activities: '구글 마이맵 → 주제도 제작 → 지역별 비교', standards: '[9사03-01]' },
            { lesson_num: '9-10', title: '파이썬으로 그리는 데이터 이야기', objective: '파이썬으로 분석 결과를 시각화한다', activities: 'matplotlib 기초 → 팀별 시각화', standards: '[9정04-03]' },
            { lesson_num: '11', title: '지속가능한 동네를 위한 제안서', objective: '데이터 근거로 제안서를 작성한다', activities: '제안서 구조 학습 → 초안 작성', standards: '[9사03-03]' },
            { lesson_num: '12', title: '데이터로 말하다 — 최종 발표회', objective: '프로젝트 결과를 발표하고 피드백', activities: '팀별 발표 → 동료 피드백 → 성찰', standards: '전체' },
          ],
        },
        core_activities: { activities: [
          { name: '공공데이터 탐험대', description: '공공데이터포털에서 우리 동네 환경 데이터를 검색·다운로드', type: '탐구·조사', materials_needed: '노트북, 인터넷', expected_outcome: '팀별 원시 데이터 파일' },
          { name: '통계 탐정', description: '대표값으로 동네 환경 이야기를 해석하는 활동', type: '문제해결', materials_needed: '계산기, 워크시트', expected_outcome: '데이터 분석 보고서' },
          { name: '파이썬 데이터 시각화', description: 'matplotlib으로 분석 결과를 차트로 표현', type: '코딩·제작', materials_needed: '노트북, Colab', expected_outcome: '시각화 차트 3종' },
        ]},
      },
      6: {
        teacher_roles: { roles: [
          { lesson_num: '1', lead_teacher: '박지호(사회)', lead_role: '프로젝트 도입', support_teacher: '김수연(수학), 이한결(정보)', support_role: '탐구 질문 보조' },
          { lesson_num: '3-6', lead_teacher: '김수연(수학)', lead_role: '통계 개념·분석 지도', support_teacher: '이한결(정보)', support_role: '스프레드시트 지원' },
          { lesson_num: '7-8', lead_teacher: '박지호(사회)', lead_role: 'GIS·마이맵 실습', support_teacher: '이한결(정보)', support_role: '기술 지원' },
          { lesson_num: '9-10', lead_teacher: '이한결(정보)', lead_role: '파이썬 시각화 수업', support_teacher: '김수연(수학)', support_role: '차트 해석 검증' },
          { lesson_num: '12', lead_teacher: '전체 공동', lead_role: '발표회 운영', support_teacher: '-', support_role: '교과별 평가' },
        ]},
        rubric: { criteria: [
          { criterion: '데이터 수집·정리', excellent: '적절한 데이터를 선별하고 체계적으로 정리함', good: '데이터를 수집하고 기본적으로 정리함', adequate: '수집하였으나 정리 미흡', needs_work: '수집이 불충분함' },
          { criterion: '통계적 분석', excellent: '대표값을 정확히 구하고 논리적으로 해석함', good: '대표값을 구하고 기본 해석을 함', adequate: '계산은 하였으나 해석 부족', needs_work: '계산에 오류' },
          { criterion: '데이터 시각화', excellent: '목적에 맞는 차트를 정확하고 심미적으로 제작', good: '적절한 시각화 방법으로 차트 제작', adequate: '시각화를 시도하였으나 부적절', needs_work: '시각화를 완성하지 못함' },
          { criterion: '제안서 작성', excellent: '데이터 근거가 명확하고 실현 가능한 제안 포함', good: '데이터 근거로 제안을 작성', adequate: '제안은 있으나 근거 약함', needs_work: '제안이 구체적이지 않음' },
        ]},
        scaffolding: { strategies: [
          { activity: '공공데이터 수집', student_level: '하위', scaffold_type: '절차적 안내', description: '단계별 가이드 시트 + 교사 1회 시연', fade_plan: '2차시부터 가이드 없이 스스로 검색' },
          { activity: '파이썬 코딩', student_level: '전체', scaffold_type: '코드 스켈레톤', description: '주석과 빈칸이 포함된 코드 템플릿 제공', fade_plan: '기본 차트 완성 후 자유 커스터마이징' },
        ]},
      },
      7: {
        student_worksheets: { worksheets: [
          { title: '공공데이터 탐색 미션카드', lesson_num: '2', purpose: '데이터 검색·선별 능력', instructions: 'data.go.kr에서 환경 데이터 3종을 찾아 기록하세요', format: '모둠 활동지' },
          { title: '대표값으로 읽는 우리 동네 환경', lesson_num: '5-6', purpose: '대표값 계산 및 해석', instructions: '평균·중앙값·최빈값을 구하고 해석하세요', format: '개인 워크시트' },
          { title: '파이썬 시각화 코딩 가이드', lesson_num: '9-10', purpose: '코드 기반 시각화', instructions: '빈칸을 채워 차트를 완성하세요', format: '디지털(Colab)' },
        ]},
        resource_list: { resources: [
          { name: '학생용 노트북', category: '디지털 기기', quantity: '모둠당 2대', availability: '확보 완료', alternative: '컴퓨터실' },
          { name: '공공데이터포털 데이터', category: '학습 자료', quantity: '-', availability: '확보 완료', alternative: '에어코리아' },
        ]},
        digital_tools: { tools: [
          { name: 'Google Colab', purpose: '파이썬 코딩 환경', url: 'https://colab.research.google.com', account_needed: 'Google 계정', alternative: 'Replit' },
          { name: 'Google 마이맵', purpose: '환경 데이터 지도 시각화', url: 'https://www.google.com/maps/d', account_needed: 'Google 계정', alternative: '카카오맵' },
          { name: '공공데이터포털', purpose: '환경 데이터 수집', url: 'https://data.go.kr', account_needed: '불필요', alternative: '에어코리아' },
        ]},
      },
      8: {
        execution_timeline: { timeline: [
          { date: '3/10(월)', period: '5교시', lesson_num: '1', content: '프로젝트 도입', room: '2-3 교실' },
          { date: '3/12(수)', period: '3교시', lesson_num: '2', content: '공공데이터 탐색', room: '컴퓨터실' },
          { date: '3/17-19', period: '블록', lesson_num: '3-6', content: '통계 분석', room: '교실/컴퓨터실' },
          { date: '3/24-26', period: '블록', lesson_num: '7-10', content: '지도+시각화', room: '컴퓨터실' },
          { date: '3/31-4/2', period: '블록', lesson_num: '11-12', content: '제안서+발표', room: '시청각실' },
        ]},
        checklist: { items: [
          { category: '시설', item: '컴퓨터실 예약', responsible: '이한결', deadline: '3/7', checked: '완료' },
          { category: '자료', item: '활동지 인쇄', responsible: '김수연', deadline: '3/8', checked: '완료' },
          { category: '자료', item: '코드 템플릿 제작', responsible: '이한결', deadline: '3/24', checked: '진행 중' },
          { category: '데이터', item: '공공데이터 사전 다운로드', responsible: '박지호', deadline: '3/10', checked: '완료' },
        ]},
        observation_log: { observations: [
          { lesson_num: '1', observer: '이한결', focus: '학생 동기유발', findings: '실제 동네 사진을 보여주니 반응이 매우 적극적', suggestions: '모둠별 탐구 질문 수준 차이 → 정교화 시간 추가' },
          { lesson_num: '3-4', observer: '박지호', focus: '통계 개념 이해도', findings: '줄기와 잎 그림은 수월, 도수분포표 계급 설정에서 어려움', suggestions: '계급 설정 예시 2가지를 보여주고 선택하게 하기' },
        ]},
      },
      9: {
        formative_feedback: { feedback_items: [
          { phase: 'A (분석)', what_observed: '주제 범위를 너무 넓게 설정하는 모둠', feedback: '동네 단위로 범위를 좁히도록 안내', action_taken: '탐구 질문 정교화 시간 10분 추가' },
          { phase: 'DI (실행)', what_observed: '파이썬 코딩에서 상위·하위 학생 속도 차이', feedback: '빠른 학생에게 멘토 역할 부여', action_taken: '난이도별 코드 템플릿 3단계로 분리' },
        ]},
        stage_reflection: { reflections: [
          { phase: 'A (분석)', what_worked: '실제 동네 데이터로 학생 동기유발이 잘 됨', what_didnt: '3교과 연결점 찾는 데 예상보다 시간 소요', lesson_learned: '교과 간 연계는 느슨하게 시작하고 점차 구체화' },
          { phase: 'DI (실행)', what_worked: '학생들의 데이터 기반 사고력이 눈에 띄게 향상', what_didnt: 'Wi-Fi 불안정으로 2회 일정 변경', lesson_learned: '디지털 의존 수업은 오프라인 대안 필수' },
        ]},
      },
      10: {
        reflection_notes: {
          goal_achievement: '4개 학습 목표 중 3개는 대부분 달성. 제안서 작성은 모둠 간 편차가 있었으나 데이터 기반 사고 습관이 형성됨.',
          vision_alignment: '학생들이 자기 동네 문제를 데이터로 설명하는 모습이 인상적. 일부 모둠은 구청에 제안서를 보내겠다는 의지.',
          student_growth: '"데이터를 활용하여 문제를 분석할 수 있다" 자기효능감이 3.2→4.1점으로 상승.',
          what_worked: ['실제 동네 데이터가 동기유발에 효과적', '3교과 교사 역할 분담이 명확', '단계적 스캐폴딩이 수준별 지원에 효과적'],
          what_didnt: ['12차시 빠듯 — 14차시 적절', 'Wi-Fi 불안정', '파이썬 코딩 수준 차이'],
        },
        improvements: { items: [
          { area: '차시 운영', current_issue: '12차시 빠듯', improvement: '14차시로 확대', priority: '높음' },
          { area: '디지털 인프라', current_issue: 'Wi-Fi 불안정', improvement: '오프라인 대안 + 핫스팟 백업', priority: '높음' },
          { area: '교과 연계', current_issue: '데이터 형식 불일치', improvement: '프로젝트 시작 전 3교과 공통 가이드라인', priority: '높음' },
        ]},
      },
    },
    chats: [
      { sender_type: 'teacher', content: '안녕하세요! 중2 수학 김수연, 사회 박지호, 정보 이한결 선생님과 함께 융합 수업을 계획하려고 합니다. 데이터 과학과 지속가능발전을 주제로 하면 어떨까요?', stage: 1, sender_name: '이한결', sender_subject: '정보' },
      { sender_type: 'ai', content: '훌륭한 조합이에요! 수학(통계)·사회(지리)·정보(데이터 분석)의 융합은 매우 자연스럽습니다.\n\n**"데이터 과학으로 만드는 지속가능한 우리 동네"** 주제를 제안드려요:\n\n1. 학생들이 공공데이터포털에서 우리 동네 환경 데이터를 직접 수집\n2. 수학 시간에 통계적으로 분석 (대표값, 그래프)\n3. 사회 시간에 지도 위에 시각화 (GIS)\n4. 정보 시간에 파이썬으로 차트 제작\n5. 최종적으로 "지속가능한 동네" 제안서 작성·발표\n\n실제 데이터를 다루기 때문에 학생 동기유발이 강력하고, 시민 역량까지 키울 수 있습니다. 어떻게 생각하시나요?', stage: 1 },
      { sender_type: 'teacher', content: '좋아요! 12차시 정도로 수학 4, 사회 4, 정보 4차시를 확보할 수 있을 것 같습니다. 구체적인 차시 구성을 제안해주실 수 있나요?', stage: 1, sender_name: '김수연', sender_subject: '수학' },
      { sender_type: 'ai', content: '12차시 구성안을 제안합니다:\n\n| 차시 | 제목 | 주 교과 |\n|------|------|--------|\n| 1 | 우리 동네, 데이터로 다시 보기 | 사회 |\n| 2 | 공공데이터 탐색·수집 | 정보 |\n| 3-4 | 데이터 정리 — 표와 그래프 | 수학 |\n| 5-6 | 대표값으로 읽는 우리 동네 | 수학 |\n| 7-8 | 동네 환경 지도 만들기 | 사회 |\n| 9-10 | 파이썬 데이터 시각화 | 정보 |\n| 11 | 지속가능 제안서 작성 | 사회 |\n| 12 | 최종 발표회 | 공동 |\n\n**설계 포인트:**\n- 사회에서 도입(왜 이 문제가 중요한지)→수학에서 분석(데이터를 어떻게 읽을 것인지)→정보에서 표현(어떻게 보여줄 것인지)의 흐름\n- 역방향 설계: 최종 산출물(제안서)→필요한 능력→차시별 활동 순으로 설계\n\n보드에 정리할까요?', stage: 1 },
      { sender_type: 'teacher', content: '파이썬 코딩 부분에서 학생들 수준 차이가 걱정됩니다. 어떻게 대비하면 좋을까요?', stage: 5, sender_name: '이한결', sender_subject: '정보' },
      { sender_type: 'ai', content: '중학생의 코딩 수준 차이는 예상되는 문제입니다. **3단계 스캐폴딩**을 제안합니다:\n\n**1단계 (기초) — 모든 학생:**\n- 빈칸 채우기(fill-in-the-blank) 코드 템플릿 제공\n- 주석이 달린 코드에서 데이터 파일명, 차트 제목만 수정\n\n**2단계 (보통) — 중위 학생:**\n- 기본 코드를 참고하여 차트 종류 변경 (막대→선→원)\n- 색상, 레이블 등 커스터마이징\n\n**3단계 (도전) — 상위 학생:**\n- 새로운 데이터셋으로 독자적 시각화\n- 여러 차트를 결합한 대시보드 구성\n\n추가로, **빠른 학생에게 "모둠 코딩 멘토" 역할**을 부여하면 리더십도 기르고, 느린 학생도 또래에게 질문하기 편해집니다.\n\n코드 스켈레톤 예시를 보드에 추가할까요?', stage: 5 },
      { sender_type: 'teacher', content: '수학 시간과 정보 시간에 데이터 처리 방식이 달라 학생들이 혼란스러워했어요. 수학에서는 손으로 계산하는데 정보에서는 코드로 하니까요.', stage: 9, sender_name: '김수연', sender_subject: '수학' },
      { sender_type: 'ai', content: '아주 중요한 발견이에요! 이건 융합 수업에서 자주 나타나는 **교과 간 용어·방법 불일치** 문제입니다.\n\n**즉각적 해결:**\n1. **공통 데이터 형식 가이드** 1페이지 제작\n   - 수학: 이 데이터를 통계표로 정리하면...\n   - 정보: 같은 데이터를 코드로 처리하면...\n   - "같은 결과, 다른 도구"임을 명시\n\n2. **브릿지 활동** 추가 (5분)\n   - 수학 시간에 손으로 구한 평균값과, 파이썬으로 구한 값이 같음을 확인\n   - "수학에서 배운 공식을 코드가 대신 계산해주는 것"\n\n**근본적 해결 (다음 운영 시):**\n- 3교과 사전 협의에서 공통 용어집과 데이터 가이드라인을 만들기\n- 교과별 수업 자료에 "다른 교과에서 같은 내용" 연결 박스 추가\n\n수시 평가 보드에 기록하겠습니다.', stage: 9 },
    ],
  },

  // ─── 3. 고등학교 ───
  {
    title: '[샘플] 머신러닝으로 예측하는 기후 변화',
    description: '고등학교 1학년 수학(함수·회귀)+과학(지구과학·기후)+정보(머신러닝) 융합 팀 프로젝트. 공공 기상 데이터를 활용해 간단한 ML 모델을 만들고, 우리 지역 기후 변화를 예측·시각화하여 발표합니다.',
    boards: {
      1: {
        team_vision: {
          vision: '학생들이 머신러닝의 원리를 이해하고, 실제 기상 데이터를 활용해 기후 변화를 예측하는 경험을 통해 AI 시대의 데이터 기반 문제 해결 역량을 키운다.',
          design_direction: '수학(함수·회귀)·과학(지구과학·기후)·정보(머신러닝)·영어(데이터 리포트) 4개 교과를 연결하여 STEAM 프로젝트로 설계한다.',
          target_students: '고등학교 1학년 (만 15~16세)',
          subjects_involved: ['수학', '과학(지구과학)', '정보', '영어'],
        },
        collaboration_agreement: {
          communication_method: 'MS Teams 채널 + 격주 대면 회의',
          meeting_frequency: '격주 1회 정기 회의 + 수업 전후 간단 협의',
          decision_method: '다수결 원칙, 교과 전문 사항은 해당 교사에게 위임',
          agreements: ['수업 자료는 회의 2일 전까지 Teams에 업로드', '교과 간 용어 충돌 시 학생 친화적 용어로 통일', '4교과 시수 균형을 맞추되 프로젝트 흐름 우선'],
        },
      },
      2: {
        team_roles: {
          members: [
            { name: '정다은', subject: '수학', role: '수학적 모델링 설계 담당', strength: '함수·회귀분석 교육 경험' },
            { name: '최원석', subject: '과학(지구과학)', role: '기후 과학 내용·실험 담당 (팀장)', strength: '기후 시스템 전문성' },
            { name: '서예린', subject: '정보', role: 'ML 모델 구현·코딩 담당', strength: '파이썬 ML 교육 경험' },
            { name: '한민수', subject: '영어', role: '영문 리포트·발표 지도 담당', strength: '학술 영어 작문 지도 경험' },
          ],
        },
        team_schedule: {
          milestones: [
            { phase: 'T (준비)', task: '팀 구성 및 4교과 연계 방향 합의', deadline: '1주차', responsible: '전체' },
            { phase: 'A (분석)', task: '주제 선정·성취기준 분석', deadline: '2~3주차', responsible: '전체' },
            { phase: 'Ds (설계)', task: '16차시 수업 설계·평가 계획', deadline: '4~5주차', responsible: '전체' },
            { phase: 'DI (실행)', task: '수업 실행 (16차시)', deadline: '6~11주차', responsible: '교과별' },
            { phase: 'E (평가)', task: '종합 성찰', deadline: '12주차', responsible: '전체' },
          ],
          ground_rules: ['ML 모델 복잡도는 선형 회귀 수준으로 제한', '영어 리포트는 A4 2페이지 이내로 학생 부담 최소화'],
        },
      },
      3: {
        topic_exploration: {
          main_topic: '머신러닝으로 예측하는 기후 변화',
          sub_topics: ['30년 기온 데이터 기반 온난화 추세 예측', '강수 패턴 변화 분석', '계절 길이 변화 예측'],
          selection_criteria: ['기상청 공개 데이터로 학습 데이터 확보 가능한가?', '고1 수준에서 의미 있는 ML 예측이 가능한가?', '글로벌 이슈로서 영어 리포트 동기가 자연스러운가?'],
          life_connection: '기후 변화는 학생들의 미래 삶에 직접적 영향을 미치는 문제다. 매년 체감하는 폭염·한파가 실제 데이터에서도 확인되는지 분석하고 ML로 미래를 예측하는 경험은 과학적 이해와 행동 동기를 제공한다.',
          rationale: '기상청에서 1990년대부터의 기온·강수량 데이터를 무료 제공한다. 선형 회귀는 고1 함수 단원과 직결된다.',
        },
        inquiry_questions: {
          essential_question: '데이터와 머신러닝은 기후 변화의 미래를 얼마나 정확하게 예측할 수 있으며, 이 예측은 우리의 행동을 어떻게 바꿀 수 있을까?',
          sub_questions: ['지난 30년간 기온·강수량은 어떤 추세를 보이는가?', '일차함수와 회귀 직선은 어떤 관계인가?', 'ML 모델의 신뢰도와 한계는 무엇인가?'],
          student_perspective: '직접 데이터를 분석하고 ML 모델을 만드는 과정에서 과학적 근거에 기반한 판단력을 키울 수 있다.',
        },
      },
      4: {
        standard_mapping: {
          mappings: [
            { subject: '수학', code: '[10수01-07]', content: '일차함수의 의미를 이해하고 그래프의 성질을 활용한다', connection: '회귀 직선을 일차함수로 이해' },
            { subject: '과학', code: '[10통과08-01]', content: '지구 시스템의 에너지 순환과 기후 변화를 이해한다', connection: '기후 시스템의 과학적 원리' },
            { subject: '정보', code: '[12정04-05]', content: 'AI의 개념과 원리를 이해하고 간단한 모델을 구현한다', connection: '선형 회귀 ML 모델 구현' },
            { subject: '영어', code: '[10영04-02]', content: '다양한 주제에 관하여 간단한 글을 쓸 수 있다', connection: '기후 분석 리포트를 영어로 작성' },
          ],
          learning_objectives: ['기상 데이터에서 일차함수적 추세를 발견하고 회귀 직선의 의미를 설명할 수 있다', '파이썬으로 선형 회귀 ML 모델을 구현하여 기온 변화를 예측할 수 있다', '데이터 분석 결과를 영어 리포트로 작성할 수 있다'],
        },
        cross_subject_links: {
          big_idea: '데이터 기반 과학적 예측과 AI 기술로 기후 위기에 대응하는 역량',
          competencies: ['수학적 모델링', '과학적 탐구', '컴퓨팅 사고력', '의사소통(다국어)'],
          links: [
            { from_subject: '수학', from_standard: '일차함수·회귀', to_subject: '정보', to_standard: 'ML 선형 회귀', rationale: '수학의 회귀 개념이 ML로 확장' },
            { from_subject: '정보', from_standard: 'AI 모델 예측', to_subject: '영어', to_standard: '분석 리포트 영작', rationale: 'ML 결과를 글로벌 맥락에서 전달' },
          ],
        },
      },
      5: {
        assessment_plan: { assessments: [
          { name: '기후 데이터 분석 보고서', type: '과정·결과 통합', timing: '6~8차시', target_standards: '[10통과08-03], [10수01-07]', method: '포트폴리오 평가' },
          { name: 'ML 기후 예측 모델', type: '수행평가', timing: '9~12차시', target_standards: '[12정04-05]', method: '산출물 평가 (모델 정확도·코드·해석)' },
          { name: '영문 데이터 리포트', type: '수행평가', timing: '13~14차시', target_standards: '[10영04-02]', method: '루브릭 기반 평가' },
        ]},
        lesson_flow: {
          total_hours: 16,
          lessons: [
            { lesson_num: '1', title: '기후가 변하고 있다', objective: '기후 변화 현상을 인식하고 프로젝트 목표를 이해한다', activities: '기후 변화 영상 시청 → 체감 경험 공유', standards: '[10통과08-01]' },
            { lesson_num: '2', title: '기후 시스템의 과학', objective: '온난화 메커니즘을 이해한다', activities: '온실효과 실험 → 개념도 작성', standards: '[10통과08-01]' },
            { lesson_num: '3-4', title: '기상청 데이터 탐험', objective: '기후 데이터를 수집·정리한다', activities: '데이터 포털 탐색 → CSV 다운로드 → 전처리', standards: '[12정04-05]' },
            { lesson_num: '5-6', title: '함수로 읽는 기후 — 회귀 직선', objective: '데이터에서 회귀 직선을 이해한다', activities: '산점도 그리기 → 추세선 → 기울기 해석', standards: '[10수01-07]' },
            { lesson_num: '7-8', title: '파이썬으로 데이터 분석', objective: 'pandas와 matplotlib으로 분석·시각화한다', activities: 'pandas 기초 → 시계열 차트', standards: '[12정04-05]' },
            { lesson_num: '9-10', title: '나의 첫 ML 모델 — 선형 회귀', objective: 'scikit-learn으로 예측 모델을 구현한다', activities: '코드 실습 → 학습/예측/평가', standards: '[12정04-05]' },
            { lesson_num: '11-12', title: '미래 기후 예측과 모델 개선', objective: '모델을 개선하고 2050년을 예측한다', activities: '특성 추가 → 예측 결과 해석 → 한계 토론', standards: '[12정04-05]' },
            { lesson_num: '13-14', title: 'Climate Data Report', objective: '영어 리포트를 작성한다', activities: 'IMRC 구조 학습 → 초안 → 피어 리뷰', standards: '[10영04-02]' },
            { lesson_num: '15-16', title: '기후 예측 컨퍼런스', objective: '최종 발표 및 종합 성찰', activities: '팀별 발표 → Q&A → 동료 평가', standards: '전체' },
          ],
        },
        core_activities: { activities: [
          { name: '온실효과 모의 실험', description: '플라스틱 용기와 온도계로 온실효과를 재현하는 실험', type: '실험·탐구', materials_needed: '플라스틱 용기, 온도계', expected_outcome: '실험 보고서' },
          { name: 'ML 선형 회귀 모델 구축', description: 'scikit-learn으로 기온 예측 모델을 만들고 성능을 평가', type: '코딩·AI', materials_needed: '노트북, Colab', expected_outcome: 'ML 모델 코드 + 예측 결과' },
          { name: 'Climate Data Report', description: 'IMRC 구조로 기후 분석 결과를 영어 리포트로 작성', type: '작문·표현', materials_needed: '영문 템플릿', expected_outcome: '영문 리포트 A4 2페이지' },
        ]},
      },
      6: {
        teacher_roles: { roles: [
          { lesson_num: '1-2', lead_teacher: '최원석(과학)', lead_role: '프로젝트 도입·실험', support_teacher: '전체', support_role: '보조' },
          { lesson_num: '5-6', lead_teacher: '정다은(수학)', lead_role: '회귀 직선 지도', support_teacher: '서예린(정보)', support_role: '코딩 도구 지원' },
          { lesson_num: '9-12', lead_teacher: '서예린(정보)', lead_role: 'ML 모델 지도', support_teacher: '정다은(수학), 최원석(과학)', support_role: '수학적 검증 + 과학적 해석' },
          { lesson_num: '13-14', lead_teacher: '한민수(영어)', lead_role: '영문 리포트 지도', support_teacher: '전체', support_role: '내용 정확성 검수' },
        ]},
        rubric: { criteria: [
          { criterion: '데이터 분석', excellent: '체계적으로 분석하고 통계적 근거로 해석', good: '기본적인 분석과 시각화 수행', adequate: '분석은 하였으나 해석 부족', needs_work: '분석 미완성' },
          { criterion: 'ML 모델 구현', excellent: '모델을 정확히 구현하고 한계를 비판적으로 분석', good: '모델을 구현하고 예측 수행', adequate: '코드 작성하였으나 해석 미흡', needs_work: '모델 미완성' },
          { criterion: '영문 리포트', excellent: '논리적 구조와 정확한 영어로 데이터 기반 리포트 작성', good: '기본 구조와 데이터 인용 포함', adequate: '구조나 표현 미흡', needs_work: '리포트 미완성' },
        ]},
        scaffolding: { strategies: [
          { activity: '회귀 직선', student_level: '중위', scaffold_type: '시각적 도구', description: 'GeoGebra로 추세선을 직접 움직이며 기울기 변화 관찰', fade_plan: '수식 기반 계산으로 전환' },
          { activity: 'ML 코딩', student_level: '전체', scaffold_type: '코드 스켈레톤', description: '주석 달린 빈칸 코드 + 실행 결과 예시 제공', fade_plan: '11차시부터 자유 코딩' },
          { activity: '영문 리포트', student_level: '하위', scaffold_type: '문장 프레임', description: '섹션별 시작 문장 프레임과 핵심 표현 20개 제공', fade_plan: 'Conclusion 자유 작성' },
        ]},
      },
      7: {
        student_worksheets: { worksheets: [
          { title: '기후 변화 브레인스토밍', lesson_num: '1', purpose: '문제 인식', instructions: '최근 5년간 체감한 기후 변화를 적고 탐구 질문을 만드세요', format: '개인→모둠' },
          { title: '추세선과 일차함수', lesson_num: '5-6', purpose: '회귀 직선 이해', instructions: '산점도에 추세선을 그리고 y=ax+b 형태로 식을 세우세요', format: '개인 워크시트' },
          { title: 'ML 모델 코딩 가이드', lesson_num: '9-10', purpose: '선형 회귀 구현', instructions: '빈칸을 채워 모델을 학습시키고 2030년 기온을 예측하세요', format: '디지털(Colab)' },
        ]},
        resource_list: { resources: [
          { name: '학생용 노트북', category: '디지털 기기', quantity: '모둠당 2대', availability: '확보 완료', alternative: '컴퓨터실' },
          { name: '기상청 기상자료개방포털 데이터', category: '학습 자료', quantity: '-', availability: '확보 완료', alternative: 'NASA GISS' },
          { name: '온실효과 실험 키트', category: '실험 도구', quantity: '모둠당 1세트', availability: '과학실 보유', alternative: '시뮬레이션 영상' },
        ]},
        digital_tools: { tools: [
          { name: 'Google Colab', purpose: '파이썬 ML 코딩', url: 'https://colab.research.google.com', account_needed: 'Google 계정', alternative: 'Jupyter' },
          { name: '기상자료개방포털', purpose: '기상 데이터 수집', url: 'https://data.kma.go.kr', account_needed: '불필요', alternative: '에어코리아' },
          { name: 'GeoGebra', purpose: '회귀 직선 시각적 탐구', url: 'https://www.geogebra.org', account_needed: '불필요', alternative: 'Desmos' },
        ]},
      },
      8: {
        execution_timeline: { timeline: [
          { date: '3/10(월)', period: '3교시', lesson_num: '1-2', content: '도입·실험', room: '과학실' },
          { date: '3/17-19', period: '블록', lesson_num: '3-6', content: '데이터 수집·함수', room: '컴퓨터실' },
          { date: '3/24-26', period: '블록', lesson_num: '7-10', content: '분석·ML 모델', room: '컴퓨터실' },
          { date: '3/31-4/2', period: '블록', lesson_num: '11-14', content: '모델 개선·리포트', room: '컴퓨터실/교실' },
          { date: '4/7-9', period: '블록', lesson_num: '15-16', content: '최종 발표회', room: '시청각실' },
        ]},
        checklist: { items: [
          { category: '시설', item: '컴퓨터실·과학실 예약', responsible: '서예린, 최원석', deadline: '3/7', checked: '완료' },
          { category: '자료', item: 'Colab 코드 템플릿 3종 제작', responsible: '서예린', deadline: '3/14', checked: '진행 중' },
          { category: '자료', item: '영문 리포트 템플릿', responsible: '한민수', deadline: '3/28', checked: '미완료' },
          { category: '데이터', item: '기상청 30년 데이터 다운로드', responsible: '최원석', deadline: '3/10', checked: '완료' },
        ]},
        observation_log: { observations: [
          { lesson_num: '2', observer: '서예린', focus: '실험 참여도', findings: '온실효과 실험이 동기유발에 매우 효과적', suggestions: '실험 결과를 데이터 분석과 바로 연결' },
          { lesson_num: '5-6', observer: '최원석', focus: '수학-과학 연계', findings: '회귀 직선의 기울기가 연간 온도 상승률임을 이해한 학생들의 반응이 인상적', suggestions: '기울기 단위(℃/년)를 강조' },
        ]},
      },
      9: {
        formative_feedback: { feedback_items: [
          { phase: 'Ds (설계)', what_observed: '수학-ML 연결점에서 학생 혼란', feedback: '수학 시간의 추세선이 ML의 선형 회귀와 같은 원리임을 명시적으로 연결', action_taken: '수학-ML 연결 요약 자료 1장 제작' },
          { phase: 'DI (실행)', what_observed: '영문 리포트 부담', feedback: '문장 프레임을 더 구체적으로 제공', action_taken: '분량 축소 + 핵심 표현 20개 목록 배포' },
        ]},
        stage_reflection: { reflections: [
          { phase: 'A (분석)', what_worked: '기후 변화라는 글로벌 이슈가 4교과 연결에 자연스러움', what_didnt: '영어 교과 연결이 다소 인위적', lesson_learned: '영문 리포트를 글로벌 커뮤니케이션으로 포지셔닝' },
          { phase: 'DI (실행)', what_worked: '수학 회귀→ML 선형 회귀의 자연스러운 연결', what_didnt: '16차시가 빠듯', lesson_learned: '모델 개선은 선택 활동으로 제공' },
        ]},
      },
      10: {
        reflection_notes: {
          goal_achievement: '특히 "회귀 직선→ML 모델" 연결에서 학생들의 수학적 이해가 깊어짐. 영문 리포트는 문장 프레임 제공 후 완성도가 올라감.',
          vision_alignment: '학생들이 단순 코딩 기술을 넘어, 모델의 예측 원리와 한계를 비판적으로 생각하는 모습이 인상적.',
          student_growth: '"AI/ML의 원리를 이해하고 있다" 자기효능감이 2.8→4.2점으로 크게 상승.',
          what_worked: ['수학 회귀→ML 선형 회귀의 자연스러운 연결', '실제 기상 데이터로 높은 학습 동기', '온실효과 실험이 출발점으로 효과적'],
          what_didnt: ['16차시 빠듯 — 18차시 적절', '영문 리포트 부담', '4교과 시수 조율 행정적 어려움'],
        },
        improvements: { items: [
          { area: '차시 운영', current_issue: '16차시 빠듯', improvement: '18차시로 확대', priority: '높음' },
          { area: '영어 연계', current_issue: '영문 리포트 부담', improvement: '분량 1페이지 축소 + 문장 프레임 강화', priority: '높음' },
          { area: '교과 연계', current_issue: '수학-ML 혼란', improvement: '브릿지 활동 추가', priority: '중간' },
        ]},
      },
    },
    chats: [
      { sender_type: 'teacher', content: '안녕하세요! 고1 수학·과학·정보·영어 4교과 융합 수업을 계획하고 있습니다. 주제는 머신러닝과 기후 변화를 연결하려고 하는데, 고1 수준에서 ML이 가능할까요?', stage: 1, sender_name: '최원석', sender_subject: '과학(지구과학)' },
      { sender_type: 'ai', content: '충분히 가능합니다! 핵심은 **선형 회귀**(Linear Regression)로 범위를 제한하는 거예요.\n\n**왜 가능한가:**\n- 고1 수학에서 일차함수 y=ax+b를 배움\n- 선형 회귀의 본질은 "데이터에 가장 잘 맞는 일차함수 찾기"\n- scikit-learn 라이브러리로 코드 3줄이면 모델 완성\n\n**교과 연결:**\n- 수학: 일차함수 → 회귀 직선의 기울기와 절편\n- 과학: 기후 시스템 → 왜 기온이 오르는가\n- 정보: 데이터 수집 → ML 모델 구현\n- 영어: 분석 결과 → Climate Data Report\n\n4교과가 매우 유기적으로 연결됩니다. "수학에서 배운 함수가 실제로 기후를 예측하는 AI의 핵심 원리"라는 걸 학생들이 체험하면 엄청난 임팩트가 있을 거예요!', stage: 1 },
      { sender_type: 'teacher', content: '영어 교과 연결이 다소 인위적으로 느껴질 수도 있는데, 어떻게 자연스럽게 만들 수 있을까요?', stage: 3, sender_name: '한민수', sender_subject: '영어' },
      { sender_type: 'ai', content: '좋은 우려입니다! 영어 연결을 자연스럽게 만드는 방법:\n\n**1. "글로벌 커뮤니케이션" 프레임으로 전환:**\n- 기후 변화는 글로벌 이슈 → 국제 학술 발표나 UN 보고서처럼 영어로 결과를 전달하는 것이 자연스러움\n- "우리의 분석을 세계에 알리자"는 동기 부여\n\n**2. 입력+출력 모두 활용:**\n- 입력: NASA, IPCC 등 영문 기후 자료 읽기 (Reading)\n- 출력: 분석 결과를 IMRC 구조 리포트로 작성 (Writing)\n\n**3. 부담 줄이기:**\n- A4 1.5~2페이지로 제한\n- 핵심 학술 표현 20개 목록 제공\n- 피어 리뷰로 서로 수정\n\n핵심은 "번역 과제"가 아니라 "글로벌 맥락에서 과학적 의사소통"으로 의미를 부여하는 거예요!', stage: 3 },
      { sender_type: 'teacher', content: '수학 시간에 배운 추세선과 ML의 선형 회귀가 같은 원리라는 걸 어떻게 학생들에게 효과적으로 연결시킬 수 있을까요?', stage: 5, sender_name: '정다은', sender_subject: '수학' },
      { sender_type: 'ai', content: '이것이 이 프로젝트의 **가장 강력한 교육적 순간**이 될 수 있어요!\n\n**브릿지 활동 (5-6차시 → 9-10차시 연결):**\n\n1. **수학 시간 (5-6차시)**\n   - 학생들이 모눈종이에 기온 데이터 산점도를 그림\n   - 자를 대고 "가장 잘 맞는 직선"을 손으로 그림\n   - y = ax + b 형태로 식을 세우고, a(기울기)의 의미를 해석\n   - "기울기가 0.03이면 매년 0.03℃씩 상승"\n\n2. **정보 시간 (9-10차시)**\n   - "여러분이 손으로 한 것을 컴퓨터가 수학적으로 최적화한 것이 ML"\n   - scikit-learn으로 같은 데이터에 대해 모델 학습\n   - 컴퓨터가 구한 a, b 값을 확인\n   - **"맞아! 내가 손으로 구한 값이랑 비슷해!"** → 아하 모먼트\n\n3. **핵심 연결 문장:**\n   > "수학에서 배운 최소제곱법이 ML의 학습 알고리즘이다"\n\n이 순간을 위해 수학 교사와 정보 교사가 사전에 같은 데이터셋을 사용하도록 조율하는 게 중요해요.', stage: 5 },
      { sender_type: 'teacher', content: '온실효과 실험을 1차시에 할까요, 아니면 데이터 분석 후에 하는 게 좋을까요?', stage: 5, sender_name: '최원석', sender_subject: '과학(지구과학)' },
      { sender_type: 'ai', content: '**1~2차시에 먼저 하는 것을 강력 추천합니다!**\n\n**이유:**\n1. **동기유발 효과**: 직접 온도가 올라가는 것을 체감하면 "왜 데이터를 분석해야 하는지" 동기가 생김\n2. **가설 설정**: "이 실험처럼 실제 지구도 온도가 오르고 있을까?" → 데이터 분석의 목적이 명확해짐\n3. **과학→데이터 흐름**: 현상 관찰(과학) → 데이터로 확인(수학·정보)의 자연스러운 탐구 과정\n\n만약 데이터 분석 후에 실험하면:\n- 이미 결론을 안 상태에서 실험 → 확인 절차에 불과\n- 탐구의 흥분이 줄어듦\n\n**추천 흐름:**\n> 실험으로 체감(2차시) → "진짜로?" 데이터 확인(3~6차시) → ML로 미래 예측(9~12차시) → 결과 공유(13~16차시)\n\n과학적 탐구의 자연스러운 순서: **관찰 → 가설 → 검증 → 예측**입니다!', stage: 5 },
    ],
  },
]