## 📁 프로그램 전체
components
 React UI 컴포넌트들이 모여있는 폴더입니다.
 - CalendarView.tsx - 일정 달력 뷰
 - ChatInterface.tsx - AI 챗봇 인터페이스
 - DiaryList.tsx - 일기 목록
 - ExpensesList.tsx, ExpensesCalendarView.tsx, ExpensesStatsView.tsx - 가계부 관련 컴포넌트
 - ContactsList.tsx - 연락처 목록
 - HistoryList.tsx - 히스토리 목록
 - Sidebar.tsx - 사이드바 네비게이션
 - NotificationsView.tsx - 알림 뷰
 - TrashView.tsx - 휴지통 뷰
 - 각종 Modal 컴포넌트들 (ConfirmationModal, ConflictModal, ScheduleDetailModal 등)
   
services
 AI 서비스 로직을 담당하는 폴더입니다.
 - geminiService.ts - Google Gemini API 연동 서비스
 - hybridService.ts - 하이브리드 AI 서비스 (로컬 모델 + Gemini 결합)
 - localModelService.ts - 로컬 AI 모델 서비스

lora_finetuned
 LoRA(Low-Rank Adaptation) 파인튜닝된 모델 파일들입니다.
 - adapter_model.bin - 파인튜닝된 어댑터 모델
 - adapter_config.json - 어댑터 설정
 - Tokenizer 관련 파일들 (vocab.json, merges.txt 등)
   
node_modules
 npm 패키지 의존성 폴더입니다.

프론트엔드 핵심 파일
 - App.tsx - React 메인 애플리케이션 컴포넌트 (92KB로 큰 파일)
 - index.tsx - React 앱 진입점
 - index.html - HTML 엔트리 파일
 - types.ts - TypeScript 타입 정의

백엔드 파일
 - server.py - Python Flask/FastAPI 서버 (48KB)

AI 학습 데이터
 - lifeone_train.jsonl - AI 모델 학습용 데이터셋 (7MB)

설정 파일
 - package.json - Node.js 프로젝트 설정 및 의존성
 - package-lock.json - 의존성 잠금 파일
 - tsconfig.json - TypeScript 컴파일러 설정
 - vite.config.ts - Vite 빌드 도구 설정
 - requirements.txt - Python 패키지 의존성
 - .env.local - 환경 변수 (Gemini API 키 등)
 - metadata.json - 프로젝트 메타데이터

## 📁 components

🗓️ CalendarView.tsx
 - 캘린더 뷰 컴포넌트
 - 월별 일정 표시 및 관리
 - 한국 공휴일 표시 기능
 - D-Day 계산 및 표시
 - 일정 카테고리 관리
 - 일정 추가/수정/삭제

💬 ChatInterface.tsx
 - AI 챗봇 인터페이스
 - 텍스트 및 이미지 입력
 - 음성 인식 지원 (Web Speech API)
 - 카테고리 자동 제안 (@멘션 기능)
 - 웹 검색 결과 출처 표시
 - 선택지(clarification) 버튼 표시

📇 ContactsList.tsx
 - 연락처 관리 (CRUD)
 - 이름/전화번호/이메일 검색
 - 그룹별 정렬 및 초성별 정렬
 - 즐겨찾기 기능
 - 전화번호/이메일 복사 기능
 - VCF 파일 가져오기 지원

📝 DiaryList.tsx
 - 일기/메모 작성 및 관리
 - 리치 텍스트 에디터 (굵게, 기울임, 색상 등)
 - 체크리스트 기능
 - 이미지 첨부
 - 그룹별 분류
 - 날짜별/내용별 정렬

💰 ExpensesList.tsx
 - 가계부 항목 목록 표시
 - 수입/지출 내역 관리
 - 날짜별 그룹핑
 - 영수증 이미지 표시
 - 항목 수정/삭제

📊 ExpensesCalendarView.tsx
 - 가계부 캘린더 뷰
 - 월별 수입/지출 시각화

📈 ExpensesStatsView.tsx
 - 가계부 통계 및 분석
 - 카테고리별 지출 그래프
 - 월별 추이 분석

🎨 Sidebar.tsx
 - 앱의 메인 네비게이션
 - 메뉴 구조 관리
 - 대화 세션 목록
 - 데이터 가져오기/내보내기
 - 카카오톡 대화 가져오기

🔔 NotificationsView.tsx
 - 알림 표시 및 관리
 - 캘린더 알림 (D-Day, 당일 일정)
 - 가계부 예산 초과 알림
 - 알림 설정 관리

📜 HistoryList.tsx
 - AI 처리 내역 목록
 - 대화 기록 관리
 - 세션별 검색/수정/삭제

🖼️ icons.tsx
 - 앱 전체에서 사용하는 SVG 아이콘 모음
 - 일관된 디자인 시스템 제공

🔧 기타 컴포넌트
 - ConfirmationModal.tsx - 확인 모달
 - ConflictModal.tsx - 데이터 충돌 해결 모달
 - DataSelectionModal.tsx - 데이터 선택 모달
 - ExpenseDetailModal.tsx - 지출 상세 모달
 - HistoryDetailModal.tsx - 처리 내역 상세 모달
 - MonthYearPicker.tsx - 월/년 선택기
 - ScheduleDetailModal.tsx - 일정 상세 모달
 - ScheduleList.tsx - 일정 목록
 - TrashView.tsx - 휴지통 뷰

모든 컴포넌트는 React + TypeScript로 작성되어 있으며, Tailwind CSS로 스타일링되어 있습니다.

## 📁 lora_finetuned
adapter_config.json (325 bytes)
 - LoRA 어댑터의 설정 파일
 - LoRA rank, alpha 값, target modules 등 LoRA 하이퍼파라미터 저장
 - 베이스 모델 정보 포함

adapter_model.bin (1.2MB)
 - 실제 학습된 LoRA 가중치 파일 (가장 중요한 파일)
 - 전체 모델이 아닌 학습 가능한 low-rank 행렬만 저장되어 있어 용량이 작음
 - 베이스 모델과 결합하여 파인튜닝된 모델을 만듦

tokenizer.json (2.1MB)
 - 토크나이저의 전체 설정 및 구성
 - 토큰화 알고리즘, 정규화, 전처리 규칙 등 포함

vocab.json (780KB)
 - 어휘 사전 (vocabulary)
 - 각 토큰과 해당 ID 매핑

merges.txt (446KB)
 - BPE (Byte Pair Encoding) 병합 규칙
 - 서브워드 토큰화에 사용

tokenizer_config.json (243 bytes)
 - 토크나이저 구성 설정
 - 모델 최대 길이, 패딩 전략 등

special_tokens_map.json (137 bytes)
 - 특수 토큰 매핑 (PAD, CLS, SEP, UNK, MASK 등)

이 폴더를 model_path로 지정하면 학습된 LoRA 모델을 불러올 수 있습니다. 베이스 모델과 adapter_model.bin을 결합하여 파인튜닝된 모델이 됩니다.

## 📁 services
geminiService.ts - Gemini API 서비스
 - 역할: Google Gemini 2.5 Flash 모델을 사용한 메인 AI 처리
 - 주요 기능:
  - 사용자 입력(텍스트/이미지)을 분석하여 데이터 추출
  - 연락처, 일정, 가계부, 다이어리 데이터 파싱
  - 데이터 수정/삭제 처리
  - Google Search 기능 통합 (웹 검색)
  - 이미지 OCR 처리
  - 복잡한 질문 처리
 - 위치: geminiService.ts:291-420의 processChat() 함수가 메인 진입점

localModelService.ts - 로컬 LoRA 모델 서비스
 - 역할: 로컬에서 실행되는 GPT-2 + LoRA Fine-tuned 모델과 통신
 - 주요 기능:
  - http://localhost:8000의 로컬 서버 헬스 체크
  - 간단한 데이터 추출 요청을 로컬 모델로 처리
  - 처리 가능 여부(canHandle) 판단
  - 비용 절감 및 빠른 응답 속도
 - 위치: localModelService.ts:44-111의 processWithLocalModel() 함수

hybridService.ts - 하이브리드 서비스 (메인 진입점)
 - 역할: 로컬 모델과 Gemini API를 지능적으로 조합
 - 처리 우선순위:
  a. 이미지가 있으면 → 무조건 Gemini 사용 (OCR 필요)
  b. 로컬 모델 시도 → 처리 가능하면 로컬 모델 사용
  c. 처리 불가/오류 시 → Gemini로 폴백
 - 최적화:
  - 로컬 모델 서버 상태 캐싱 (30초 간격)
  - 비용 절감 (간단한 작업은 로컬 처리)
 - 위치: hybridService.ts:55-229의 processChat() 함수
```
아키텍처 흐름

사용자 입력 → hybridService.processChat()
                ├─ 이미지 있음? → geminiService
                ├─ 로컬 서버 활성화? → localModelService
                │   └─ 처리 가능? → ✓ 완료
                │       └─ 처리 불가? → geminiService (폴백)
                └─ 로컬 서버 비활성화? → geminiService
```
                
실제로는 hybridService.ts의 processChat()을 호출하면 모든 것이 자동으로 처리됩니다.

## 📁 node_modules
특수 파일/폴더
 - .bin/ - npm 패키지들이 제공하는 실행 가능한 명령어 (vite, tsc 등)
 - .package-lock.json - 설치된 모든 패키지의 정확한 버전 정보를 기록한 잠금 파일
 - .vite/, .vite-temp/ - Vite 빌드 도구의 캐시 및 임시 파일

@ 스코프 패키지 (조직/네임스페이스별 그룹화)
 - @babel/ - JavaScript 트랜스파일러 관련 패키지
 - @esbuild/ - esbuild 플랫폼별 바이너리
 - @google/ - Google API 관련 패키지
 - @jridgewell/ - 소스맵 관련 유틸리티
 - @rollup/, @rolldown/ - Rollup 번들러 관련 플러그인
 - @types/ - TypeScript 타입 정의 파일들
 - @vitejs/ - Vite 플러그인들

주요 개발 도구
 - typescript/ - TypeScript 컴파일러
 - vite/ - 빠른 개발 서버 및 빌드 도구
 - esbuild/ - 초고속 JavaScript 번들러
 - rollup/ - JavaScript 모듈 번들러
 - postcss/ - CSS 후처리 도구

React 관련
 - react/ - React 라이브러리 코어
 - react-dom/ - React DOM 렌더링
 - react-refresh/ - React Fast Refresh (HMR)
 - scheduler/ - React 스케줄러

Google 인증/API
 - google-auth-library/ - Google API 인증
 - google-logging-utils/ - Google 로깅 유틸리티
 - gaxios/ - Google API용 HTTP 클라이언트
 - gcp-metadata/ - Google Cloud Platform 메타데이터
 - gtoken/ - Google 토큰 관리

네트워크/HTTP
 - node-fetch/ - Node.js용 Fetch API
 - https-proxy-agent/ - HTTPS 프록시 에이전트
 - agent-base/ - HTTP 에이전트 기본 클래스
 - ws/ - WebSocket 구현

파일 시스템/경로
 - glob/, minimatch/ - 파일 패턴 매칭
 - tinyglobby/ - 경량 glob 구현
 - fdir/ - 빠른 디렉토리 크롤러
 - rimraf/ - 크로스 플랫폼 rm -rf
 - path-scurry/ - 경로 탐색 유틸리티

보안/인증
 - jws/, jwa/ - JSON Web Signature/Algorithm
 - ecdsa-sig-formatter/ - ECDSA 서명 포맷터
 - buffer-equal-constant-time/ - 타이밍 공격 방지용 버퍼 비교

브라우저 호환성
 - browserslist/ - 타겟 브라우저 목록 관리
 - caniuse-lite/ - 브라우저 기능 지원 데이터
 - electron-to-chromium/ - Electron-Chromium 버전 매핑
 - update-browserslist-db/ - Browserslist 데이터베이스 업데이트

유틸리티
 - semver/ - 시맨틱 버저닝
 - nanoid/ - 고유 ID 생성기
 - debug/ - 디버깅 유틸리티
 - ms/ - 시간 변환 유틸리티
 - lru-cache/ - LRU 캐시 구현
 - cross-spawn/ - 크로스 플랫폼 프로세스 실행

문자열 처리
 - ansi-regex/, ansi-styles/ - ANSI 코드 처리
 - strip-ansi/ - ANSI 코드 제거
 - string-width/ - 문자열 너비 계산
 - wrap-ansi/ - ANSI 문자열 줄바꿈
 - emoji-regex/ - 이모지 정규식
 - eastasianwidth/ - 동아시아 문자 너비

데이터 처리
 - bignumber.js/ - 큰 숫자 연산
 - json-bigint/ - BigInt 지원 JSON 파서
 - json5/ - JSON5 파서
 - base64-js/ - Base64 인코딩/디코딩
 - safe-buffer/ - 안전한 Buffer 구현

기타
 - picocolors/ - 경량 터미널 색상
 - picomatch/ - 빠른 glob 매칭
 - source-map-js/ - 소스맵 생성/파싱
 - jsesc/ - JavaScript 문자열 이스케이핑
 - which/ - 크로스 플랫폼 which 명령

이 폴더는 React + TypeScript + Vite 프로젝트에 Google API 인증 기능이 포함된 것입니다.
