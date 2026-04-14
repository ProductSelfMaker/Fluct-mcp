/**
 * Builds the system-prompt text returned by the MCP
 * `bootstrap_from_repo` prompt. The MCP client (Claude Code, Cursor,
 * Desktop, etc.) is expected to inject this into a fresh conversation
 * whose active tools are the user's filesystem tools + the Fluct MCP
 * tools. The AI then uses those tools to read the repo and call
 * `create_*` / `add_dependency` on Fluct to build the service map.
 *
 * The prompt is intentionally Korean-default because Fluct's primary
 * audience is Korean. Output-language policy is controlled separately
 * via the `language` argument — regardless of instruction language,
 * descriptions and policies are emitted in the chosen user language.
 */

export type BootstrapLanguage = 'ko' | 'en'

export interface BootstrapPromptArgs {
  /** Output language for description/policy fields. Defaults to 'ko'. */
  language?: BootstrapLanguage
  /** Optional directory to restrict analysis to (e.g. 'app/dashboard'). */
  scope?: string
  /** If true, the AI must not call any write tools — plan-only output. */
  dryRun?: boolean
  /** GitHub repo in "owner/repo" format for remote analysis without local code. */
  githubRepo?: string
}

export function buildBootstrapPrompt(args: BootstrapPromptArgs = {}): string {
  const language: BootstrapLanguage = args.language ?? 'ko'
  const scope = args.scope?.trim() || null
  const dryRun = !!args.dryRun
  const githubRepo = args.githubRepo?.trim() || null

  const languageLabel = language === 'ko' ? '한국어' : 'English'
  const nameRule =
    language === 'ko'
      ? '한국어 우선, 고유명사는 영문 그대로 (예: "GitHub OAuth", "Stripe Checkout")'
      : 'English'

  const dryRunSection = dryRun
    ? `
## ⚠️ DRY RUN 모드 (이번 실행 한정)

이번 실행은 **시뮬레이션**이야. 다음 규칙을 엄격히 지켜:

- \`create_product\`, \`create_page\`, \`create_feature\`, \`update_node\`,
  \`delete_node\`, \`add_dependency\`, \`remove_dependency\` 등 어떤
  write tool도 **절대 호출하지 마**
- \`get_service_map\`, \`get_node\` 등 read tool은 자유롭게 써도 됨
- 분석 결과를 마크다운 리스트로 출력만 할 것:

  \`\`\`markdown
  ## 생성 계획 (DRY RUN)

  ### Product (1)
  - 이름 — 설명 요약

  ### Pages (N)
  - /route — 한 줄 설명
  - /route/sub — 한 줄 설명

  ### Features (M)
  - [scope=page] parent: /route > 기능이름 — 설명
  - [scope=shared] 공유 기능 이름 — 설명
  - [external_api] 기능 이름 (endpoint=...) — 설명

  ### 예상 의존성: K개
  ### 총 노드: 1 + N + M = X개

  ### 검토 포인트
  - shared 판정: 왜 이 노드들이 shared인지 근거
  - policy 비어있는 노드: 사용자 보강 필요 리스트
  \`\`\`

- 마지막에 이 안내 문구 포함:
  "이 결과를 실제로 생성하려면 dry_run 인자 없이 다시 실행해주세요."
`
    : ''

  const scopeSection = scope
    ? `
## 🎯 분석 범위 제한 (이번 실행 한정)

이번에는 **\`${scope}\` 디렉토리만** 분석해. 그 외 디렉토리는 읽지 마.
해당 범위 안의 라우트와 기능만 노드로 만들어.
(범위 밖에서 import 관계가 이어진다면, 노드 생성은 범위 안으로 한정하되
\`add_dependency\`로 연결은 시도해도 됨)
`
    : ''

  return `이 레포의 코드를 분석해서 Fluct 서비스맵을 자동으로 구축해줘.
아래 지침을 **순서대로** 따라. 원칙은 엄격하지만, 네 프로젝트가
이 템플릿의 기본 가정(Next.js \`app/\` 라우트 트리, Node.js 생태계,
80 노드 상한 등)과 **크게** 다르면 벗어나도 좋아 — 단, 벗어난
결정과 이유를 최종 리포트(§11)에 한 줄 남겨. 모노레포, 멀티레포
마이크로서비스, Django/Rails/Go 같은 비-\`app/\` 구조가 대표적이야.

## 0. 시작 전 체크

먼저 \`fluct.get_service_map\`을 호출해서 현재 맵 상태를 확인해.
- 이미 노드가 있으면 **작업을 일시 중단**하고 사용자에게 물어봐:
  (a) 기존 맵에 누락된 것만 추가 (비파괴)
  (b) 중단 (사용자가 먼저 수동으로 정리)
- 비어있거나 사용자 승인 시 다음 단계로 이동

## 0.5. 코드 접근 방법 확인

이 프롬포트는 네가 레포 파일을 **직접 읽을 수 있다**는 걸 전제로 해.
${githubRepo ? `\n> **GitHub 레포가 지정됨: \`${githubRepo}\`** — 아래 "경로 A" GitHub API 분석을 즉시 시작해.\n` : ''}
다음 중 하나라도 해당되면 §1로 넘어가기 전에 사용자에게 물어봐:

- 로컬 파일시스템 도구가 없거나 레포가 이 머신에 체크아웃돼 있지 않음
- 코드가 프라이빗 레포에만 있어서 읽기 권한이 없음
- 사용자가 PM/디자이너 입장에서 MCP만 쓰고 있고 코드 베이스는 따로 있음

### 경로 A — GitHub API 원격 분석 (권장)

사용자가 GitHub 레포 URL 또는 \`owner/repo\`를 제공했으면 이 경로를 따라.
로컬 파일이 필요 없고, **WebFetch**로 GitHub API를 호출해 분석해.

**Step 1. 기본 브랜치 확인**
\`\`\`
GET https://api.github.com/repos/<owner>/<repo>
\`\`\`
응답의 \`default_branch\` 필드로 메인 브랜치명을 파악해.

**Step 2. 디렉토리 트리 가져오기**
\`\`\`
GET https://api.github.com/repos/<owner>/<repo>/git/trees/<branch>?recursive=1
\`\`\`
응답의 \`tree\` 배열에서 전체 파일 목록을 받아. 이것이 §1 읽기 순서의
\`app/\` 또는 \`src/\` 디렉토리 트리 역할을 대체해.

**Step 3. §1 읽기 순서에 따라 핵심 파일 읽기**
개별 파일은 raw URL로 접근:
\`\`\`
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
\`\`\`
읽기 순서 (§1과 동일, 토큰 효율을 위해 필요한 파일만):
1. \`package.json\` — 스택/의존성
2. \`README.md\`, \`CLAUDE.md\`, \`AGENTS.md\` — 프로덕트 의도
3. \`.env.example\` — 외부 통합 시그널
4. 프레임워크 설정 (\`tsconfig.json\`, \`next.config.*\`, \`vercel.ts\`)
5. DB 스키마 (\`lib/db/schema.*\`, \`prisma/schema.prisma\`)
6. i18n 파일 (\`messages/*.json\`)
7. Step 2의 트리에서 라우트 구조를 파악한 뒤, **핵심 라우트 파일만** 선별 열람

**Step 4. 라우트 파일 선별 읽기**
트리에서 라우트 진입점(\`page.tsx\`, \`route.ts\`, \`+page.svelte\` 등)을 식별하고,
각 라우트의 소스를 읽어 feature를 추출해. 전체를 읽지 말고 **import 구문과
export된 컴포넌트/핸들러 시그니처**를 중심으로 빠르게 훑어.

**Step 5. 분석 불가 영역 처리**
GitHub API로 읽을 수 없는 파일(바이너리, 너무 큰 파일)이나
프라이빗 레포 접근 실패 시:
- 해당 영역의 description/policy를 비워두고
- 최종 리포트(§11)에 "코드 접근 방식: GitHub API" + 미분석 영역 목록 명시

**프라이빗 레포**: GitHub API 호출 시 401이 돌아오면 사용자에게 안내:
"프라이빗 레포입니다. 다음 중 하나를 선택해 주세요:
(a) 레포를 로컬에 클론한 뒤 다시 실행
(b) 핵심 파일(package.json, README, 디렉토리 트리)을 대화창에 붙여넣기"

### 경로 B — 핵심 파일 붙여넣기

GitHub URL이 없고 로컬 코드도 없으면, 사용자에게 다음을 대화창에
붙여달라고 **구체적으로** 요청:
- \`package.json\`
- \`README.md\`
- \`.env.example\`
- \`app/\` 또는 \`src/\` 디렉토리 트리 (\`find app -type f\` 출력)

붙여넣은 내용만으로 §1~§6 수행. 읽지 못한 영역은 description 비움.

### 경로 C — 중단

위 경로 모두 불가능하면 안내 후 종료:
"레포 분석을 위해 로컬 체크아웃, GitHub URL, 또는 핵심 파일 내용 중
하나가 필요합���다."

대안 경로로 진행하는 경우, 리포트(§11)에 "코드 접근 방식: <방식>" 한 줄
명시하고, 읽지 못한 영역은 description/policy를 비우고 사용자 보강을 요청.
로컬 접근이 있으면 이 단계 건너뛰고 §1로.

## 1. 읽기 순서 (하향식 — 맥락부터 잡기)

랜덤하게 파일을 열지 말고 다음 순서로 프로덕트 전체 맥락부터 파악해:

1. \`package.json\` — 스택, 프레임워크, 의존 라이브러리로 도메인 추정
2. \`README.md\`, \`CLAUDE.md\`, \`AGENTS.md\` — 프로덕트 의도와 컨벤션
3. \`.env.example\` — **외부 통합의 가장 강력한 시그널** (\`STRIPE_*\` → 결제,
   \`OPENAI_*\` → AI, \`SUPABASE_*\` → auth/DB)
4. \`tsconfig.json\`, \`next.config.*\`, \`vercel.ts\`, \`vercel.json\` — 프레임워크 설정
5. \`lib/db/schema.*\`, \`prisma/schema.prisma\`, \`drizzle.config.*\` — 도메인 엔티티
   (있으면 policy 필드 품질이 크게 올라감)
6. \`messages/*.json\` 또는 i18n 파일 — 기능 목록 힌트
7. \`app/\` 또는 \`pages/\` 디렉토리 구조 — 라우트 트리 (ls + glob)
8. 개별 소스 파일은 위 맥락 기반으로 **필요한 파일만** 타겟 열람 (전체 읽기 금지 — 토큰 낭비)

## 2. 무시할 경로

다음은 분석에서 제외. 노드 생성 금지:

\`\`\`
node_modules/  .next/  dist/  build/  .vercel/  out/  coverage/
.git/  supabase/migrations/meta/  public/  .turbo/
*.test.*  *.spec.*  __tests__/  __mocks__/
components/ui/        ← shadcn/ui primitives
\`\`\`

## 3. 노드 타입 매핑

### Product (1개만)
- Tool: \`create_product({ name, role?, description })\`
- \`name\`: 레포 이름 또는 제품 이름
- \`description\`: README를 2-3문장으로 요약

### Page / System
- Tool: \`create_page({ name, productNodeId, kind, identifier, description, parentPageId? })\`
- Next.js App Router 기준 \`app/<route>/page.tsx\` → \`kind='page'\`
- \`app/api/<route>/route.ts\` → \`kind='system'\` (백엔드 전용)
- \`identifier\`: URL 경로 (예: \`/login\`, \`/dashboard/[id]\`, \`/api/mcp\`)

**페이지 상하관계 (parentPageId) — 반드시 적용:**
- URL 경로가 다른 페이지의 하위 경로이면 \`parentPageId\`를 **반드시 지정**
- 예시:
  - \`/dashboard\` → 상위 페이지 (parentPageId 없음)
  - \`/dashboard/settings\` → parentPageId = \`/dashboard\`의 ID
  - \`/dashboard/org/[orgId]\` → parentPageId = \`/dashboard\`의 ID
  - \`/dashboard/org/[orgId]/settings\` → parentPageId = \`/dashboard/org/[orgId]\`의 ID
- 상위 페이지를 **먼저 생성**한 뒤 하위 페이지를 생성해야 parentPageId를 참조 가능

### Feature (다음에 해당하면 feature 노드로)

**A. 코드 레벨 feature** (정적 분석으로 쉽게 잡힘):
- 데이터 페칭 (fetch, SWR, React Query, server action)
- 비즈니스 로직 (결제 처리, 권한 확인, 상태 머신, 검증 로직)
- 외부 서비스 호출 (SDK 메서드, API client)
- auth 플로우 (login, logout, callback, token refresh)
- 백그라운드 작업 (cron, queue, webhook handler)

**B. 인터랙션 feature** ⚠️ (자주 놓치는 카테고리 — 반드시 잡을 것):

PM이나 사용자가 스크린샷을 보며 손가락으로 가리킬 수 있는 UI 요소는
코드상으로는 "React 컴포넌트"일 뿐이어도 **노드로 승격**해야 해. 다음
패턴을 적극적으로 feature로 잡아라:

- **패널 / 드로어 / 모달** — \`components/ui/\`에 속하지 않고 **도메인 상태·폼 로직**을 담은 것
  (예: \`SidePanel\`, \`NodeDetailPanel\`, \`SettingsDrawer\`, \`InspectorPanel\`)
- **계층 / 트리 네비게이터** — 좌측 사이드바, outline, TreeView, 폴더 트리
- **드래그/드롭 상호작용** — \`onDrop\`, \`react-dnd\`, React Flow \`onNodeDragStop\`,
  \`onNodeDrag\`, \`dnd-kit\` 핸들러가 붙은 컴포넌트
- **캔버스 상호작용** — zoom/pan 컨트롤, 선택 박스, multi-select, minimap
- **키보드 단축키 시스템** — \`useHotkeys\`, \`use-keyboard\`, 글로벌 \`keydown\` 리스너
  (개별 단축키가 아니라 "단축키 시스템" 한 노드로 묶어도 OK)
- **컨텍스트 메뉴 / 툴팁 / 팝오버** — 우클릭 메뉴, 툴팁에 액션이 담긴 것
- **실시간 동기화 / 존재감 표시** — collab cursor, live updates, WebSocket subscription
- **폼 / 마법사 / 다단계 입력** — 여러 단계에 걸친 사용자 입력 수집
- **검색 / 필터 / 정렬 UI** — 검색창, 필터 패널, 정렬 컨트롤

Tool: \`create_feature({ name, scope, pageNodeId?, parentFunctionId?, kind, identifier, description, policy?, endpoint? })\`

### Feature 뎁스 규칙 (3+ 분할)

하나의 feature가 **3개 이상의 독립적인 UI 영역 또는 서브 로직**을 포함하면,
컨테이너를 **부모 노드**로, 각 서브를 \`parentFunctionId\`로 연결된 **자식 노드**로
분리해. 2개 이하면 하나로 유지해서 노드 폭발을 방지.

**분할 기준** — 아래 중 하나라도 해당하면 "독립 서브"로 카운트:
- 별도의 탭/패널/모달로 렌더링됨
- 독자적인 상태(state)를 관리함
- 별도 서버 액션/API를 호출함
- 사용자가 독립적으로 인지하는 기능 단위임

**예시**:
| 부모 노드 | 자식 노드 (3+이므로 분할) |
|---|---|
| 노드 인스펙터 패널 | Product 필드 편집, Page 필드 편집, Feature 필드 편집, 의존선 탭, 코멘트 탭 |
| MCP 도구 디스패처 | 읽기 도구, 쓰기 도구, 엣지 도구, 프롬프트 |
| 화이트보드 런타임 | 노드 드래그/자동저장, 자동 레이아웃, 상태 필터, 트리 사이드바, 인스펙터 패널 |

**부모 노드의 description**: 자식들의 역할을 총괄하는 한 문장.
자식 노드의 description: 해당 서브 기능의 구체적 동작.

### Feature로 만들지 말 것
- **진짜 UI primitives** (Button, Input, Card, Dialog의 껍데기만 있는 shadcn/ui 컴포넌트 등)
- **단순 레이아웃 래퍼** — prop만 받아 렌더링하고 상태·핸들러·도메인 로직이 **전혀 없는** 것
- 유틸리티 함수 (\`cn\`, \`formatDate\`, \`parseX\`)
- 타입 정의만 있는 파일
- 상수 정의 파일

### 경계선 판단 (primitive vs 인터랙션 feature)

애매할 때 아래 질문 3개를 순서대로 해봐:

1. 이 컴포넌트가 **도메인 상태**를 담고 있나? (useState/context/store를 통해 제품 데이터를 다룸)
2. 사용자가 **직접 상호작용**하나? (클릭·드래그·타이핑·단축키로 뭔가를 일으킴)
3. 이게 사라지면 **사용자가 기능이 하나 없어졌다**고 느낄까?

셋 중 **둘 이상이 YES**면 feature로 만들어라. 셋 다 NO면 primitive로 분류하고 스킵.

## 4. Shared function 판정 알고리즘 (기계적 — 주관 금지)

UI 컴포넌트/훅/유틸이 shared인지 결정하는 절차:

1. 후보 모듈을 정함
2. \`grep "from.*<경로>"\` 전체 소스에서 검색 (테스트 파일 제외)
3. import한 파일들이 속한 **루트 라우트 디렉토리**를 유니크로 집계
4. 결과:
   - 2개 이상 유니크 라우트에서 사용 → \`scope='shared'\` (pageNodeId 없이 생성)
   - 1개 라우트에서만 사용 → \`scope='page'\`, 해당 페이지 하위
   - 0개 (dead code) → 노드 생성 스킵

## 5. External API 감지 (중요 — 디테일이 핵심)

**가장 중요한 원칙**: external_api 노드의 정체성은 "어떤 SDK를 썼나"가
아니라 **"어떤 외부 서비스 / 외부 기능과 통신하나"** 이다. 같은 SDK를
거치더라도 호출 대상이 다르면 **반드시 별개 노드**로 만든다. "같은
SDK면 하나로 묶기"는 절대 금지.

### ❌ 흔한 collapse 실수 (하지 말 것)

- Supabase가 OAuth provider 여러 개를 proxy하는데 \`Supabase\` 하나로
  뭉치기
- Stripe의 결제/구독/고객 API를 \`Stripe\` 하나로 뭉치기
- OpenAI의 chat/embedding/image를 \`OpenAI\` 하나로 뭉치기
- 모든 REST 호출을 \`Backend API\` 같은 추상 이름으로 뭉치기

### ✅ 올바른 분별 예시

#### Supabase (SDK 이름 말고 실제 통신 대상 기준으로 쪼개기)

코드에 \`supabase.auth.signInWithOAuth({ provider: 'github' })\`가
있으면 그건 **Supabase가 아니라 GitHub OAuth** 노드. 인자 리터럴의
\`provider\` 값이 실제 외부 서비스 이름이다. 같은 파일에
\`provider: 'google'\`도 있으면 **GitHub OAuth**와 **Google OAuth**
두 개의 별개 노드를 만들어라.

| 코드 패턴 | external_api 노드 이름 (예시) |
|---|---|
| \`supabase.auth.signInWithOAuth({ provider: 'github' })\` | **GitHub OAuth** |
| \`supabase.auth.signInWithOAuth({ provider: 'google' })\` | **Google OAuth** |
| \`supabase.auth.signInWithOAuth({ provider: 'kakao' })\` | **Kakao OAuth** |
| \`supabase.auth.signInWithPassword(...)\` | **Supabase Auth (Email/Password)** |
| \`supabase.auth.getSession\` / \`onAuthStateChange\` | (세션 훅. 보통 feature, external_api 아님) |
| \`supabase.from('users').select(...)\` | (내부 DB 접근. external_api 아님, 일반 feature) |
| \`supabase.storage.from('bucket').upload(...)\` | **Supabase Storage** |
| \`supabase.functions.invoke('X')\` | **Supabase Edge Function: X** |
| \`supabase.realtime.channel(...)\` | **Supabase Realtime** |

\`provider\` 값이 변수면 변수 정의까지 역추적해서 리터럴을 찾아라.
끝까지 불확실하면 \`OAuth (Unknown Provider)\` 같은 이름으로 단일
노드를 만들고 policy에 "provider 변수 동적 — 확인 필요" 메모.

#### Stripe (도메인 기준으로 쪼개기)

| 코드 패턴 | 노드 이름 |
|---|---|
| \`stripe.checkout.sessions.create(...)\` | **Stripe Checkout** |
| \`stripe.subscriptions.create/update/cancel\` | **Stripe Subscriptions** |
| \`stripe.customers.create/retrieve\` | **Stripe Customers** |
| \`stripe.charges.create\` | **Stripe Charges** |
| \`stripe.webhooks.constructEvent\` (웹훅 수신) | **Stripe Webhooks** |

#### OpenAI / Anthropic (용도별로 쪼개기)

| 코드 패턴 | 노드 이름 |
|---|---|
| \`openai.chat.completions.create\` | **OpenAI Chat Completions** |
| \`openai.embeddings.create\` | **OpenAI Embeddings** |
| \`openai.images.generate\` | **OpenAI Image Generation** |
| \`anthropic.messages.create\` | **Anthropic Messages** |

#### GitHub API (octokit)

- \`@octokit/rest\`로 사용하는 리소스별로:
  \`Octokit — Repos\`, \`Octokit — Issues\`, \`Octokit — PullRequests\` 등
- 단 **한 가지 리소스만** 쓴다면 \`GitHub API\` 하나로 묶어도 OK

#### 일반 fetch 호출

- \`fetch('https://api.x.com/v1/tweets')\` → **Twitter API** (도메인 기준)
- \`fetch(process.env.INTERNAL_API_URL + '/users')\` → 변수 역추적해서
  실제 엔드포인트 판정. 모르면 \`policy\`에 "엔드포인트 확인 필요" 메모

### 분별 알고리즘 (기계적으로)

1. **SDK import 찾기**: \`@supabase/supabase-js\`, \`stripe\`, \`openai\`,
   \`@anthropic-ai/sdk\`, \`@octokit/rest\`, \`resend\`, \`twilio\`, \`sentry\` 등
2. **클라이언트 변수 추적**: \`const supabase = createClient(...)\`,
   \`const stripe = new Stripe(...)\` 등
3. **각 메서드 체인 스캔**: 그 클라이언트로 호출한 메서드 + 전달된
   리터럴 인자 수집
4. **서비스 정체성 결정**:
   - 메서드의 도메인이 다르면 다른 노드 (\`auth\` vs \`storage\` vs \`from\`)
   - 인자에 provider 리터럴이 있으면 그 리터럴이 진짜 서비스 이름
   - 명확한 외부 도메인 URL이 있으면 그 도메인이 서비스 이름
5. **env 변수는 힌트로만**: \`.env.example\`의 \`STRIPE_SECRET_KEY\`는
   "Stripe 쓴다는 증거"지만 정확한 노드 세분화는 실제 코드 호출이
   결정함. env 이름만으로 노드 만들지 말 것.
6. **fallback**: 위 어느 규칙도 매칭 안 되는 커스텀 통합은 해당 통합
   코드 위치 기준으로 \`<서비스 이름> Integration\` 형태로 생성

### endpoint 필드 작성

- fetch / axios URL이면 URL 그대로
- SDK면 \`sdk.namespace.method\` (예: \`stripe.checkout.sessions.create\`,
  \`supabase.auth.signInWithOAuth(github)\`)
- OAuth의 경우 provider를 괄호에 표기해서 식별성 강화

### split over merge 원칙

애매하면 **split (쪼개기)**. 나중에 사람이 병합하는 게 그 반대보다
훨씬 쉽다. "이게 같은 서비스인가 다른 서비스인가?" 고민되면 두 개
만들고 policy에 "같은 서비스인지 검토 필요" 메모.

### 하위 기능 세분화 (뭉치기 금지)

기능 노드를 만들 때 하나의 노드에 여러 독립적인 동작을 뭉치지 마.
코드에서 독립적으로 작동하는 각 서브 기능은 **parentFunctionId로
연결된 별도 자식 노드**로 만들어라.

**뭉치면 안 되는 예시:**
- ❌ "사용자 인증" 하나에 OAuth + 이메일 로그인 + 세션 관리 + 비밀번호 재설정을 뭉침
- ✅ "사용자 인증"(부모) → "Google OAuth"(자식), "GitHub OAuth"(자식), "이메일 로그인"(자식), "비밀번호 재설정"(자식)

**판정 기준:** 별도 파일에 구현되어 있거나, 별도 서버 액션을 호출하거나,
UI에서 독립적으로 트리거되면 → 별도 자식 노드.

## 6. 생성 순서 (의존성 때문에 반드시 이 순서)

a. \`create_product\` — 1개만. 맨 먼저
b. \`create_page\` — 라우트별. **상위 페이지부터** (nested route는 parentPageId로)
c. \`create_feature\` — scope='page'는 해당 페이지 하위, scope='shared'는 프로덕트 직속
d. \`add_dependency\` — 함수/페이지 간 import·호출 관계. **마지막에 일괄 처리**
   - page ↔ shared function은 \`nodeType: 'page_to_feature'\` 사용
   - 같은 타입 간: \`'product'\` / \`'page'\` / \`'feature'\`
   - **description 필수**: 왜 이 연결이 필요한지 간결하게 기록
     예: "로그인 성공 시 대시보드로 리다이렉트", "장바구니 데이터 조회 후 결제 진행"
   - description도 글머리 기호로 작성 가능 (연결 이유가 여러 개일 때)
e. \`create_permission\` + \`assign_permission\` — 노드에 접근 조건이 있으면 권한 라벨 생성 후 태깅
   - 예: "관리자 전용", "유료 플랜", "프로젝트 모드 전용", "editor+ 역할"
   - 코드에 RBAC/feature flag/guard가 있으면 permission으로 매핑
   - 불확실하면 태깅하지 않음 (미지정 = 전체)
f. \`create_scenario\` — **모든 노드, 의존성, 권한이 완료된 후 마지막에 생성**
   - 시나리오는 **선형** 스텝 리스트 (분기/조건 없음)
   - 스텝별 필드:
     - \`description\` (필수): 유저가 이 단계에서 무엇을 하는지
     - \`trigger\` (선택): 이 스텝이 시작되는 계기 (예: "로그인 버튼 클릭", "페이지 로드", "결제 성공 webhook")
     - \`isAnchor\` (선택): 이 스텝이 분기 지점이면 true로 설정
   - \`create_scenario\`는 스텝 생성 후 **stepId 목록을 반환** — 이 ID를 anchor/연결 작업에 그대로 사용
   - 시나리오 스텝은 실제 유저 흐름 순서대로 노드를 참조

g. **분기/재사용 패턴**: 필요하면 시나리오를 분리하고 연결로 표현
   - 메인 시나리오 생성 시 분기 지점 스텝에 \`isAnchor: true\`를 처음부터 넣는 것이 권장 (한 번에 앵커까지 완성)
   - 나중에 앵커가 필요해지면 \`toggle_step_anchor\`로 소급 마킹
   - 분기 시나리오 생성 방법 2가지:
     1. **\`create_scenario_from_anchor\`** (권장): 앵커 스텝 ID만 주면 새 시나리오 + 연결까지 원샷. 앵커 노드가 자동으로 1번 스텝이 됨.
     2. \`create_scenario\` + \`create_scenario_connection\`을 따로 호출 (세밀한 제어가 필요할 때만)
   - \`condition\` 텍스트로 분기 트리거 표현 (예: "비밀번호 틀림", "재고 없음")
   - 같은 앵커에 여러 시나리오를 연결하면 다중 분기 표현 가능

h. **기존 시나리오 조회/수정**:
   - \`get_scenarios\` → 시나리오 목록 (ID, 스텝 수)
   - \`get_scenario_steps\` → 각 스텝의 stepId, trigger, isAnchor, description 모두 반환
   - \`get_anchors\` → 현재 앵커로 마킹된 모든 스텝 (분기 가능한 지점들)
   - \`get_scenario_connections\` → 시나리오 간 연결 관계를 이름/스텝 순번으로 표시
   - \`update_scenario_step\` → description/trigger/isAnchor 중 일부만 수정
   - \`reorder_scenario_steps\` → 시나리오 내 스텝 순서 재배치 (stepId 배열 전달)
   - \`remove_scenario_step\` / \`delete_scenario_connection\` / \`delete_scenario\` → 정리 작업

## 6-B. 구조 변경의 원칙: ID 보존

기획/개발이 바뀌면 노드 구조도 바뀌게 돼. **단, 노드를 지우고 다시 만들면 그 노드를 참조하는 시나리오 스텝과 의존성이 전부 끊어지니 금지.** ID를 유지한 채 변형하는 도구를 반드시 사용해:

- **페이지를 다른 상품으로 이동 / 중첩 페이지 변경**: \`update_node\`의 \`productNodeId\` 또는 \`parentPageId\` 필드
- **기능을 다른 페이지로 이동**: \`update_node\`의 \`pageNodeId\` (동일 scope 내에서만)
- **기능을 "공유 기능"으로 승격 / 다시 페이지 전용으로 강등**: \`convert_feature_scope\` (scope='shared' 또는 'page'). 공유 전환 시 \`pageNodeId\`가 자동으로 null이 되고, 페이지 전환 시 새 \`pageNodeId\`를 인자로 전달.
- **이름/식별자/설명만 변경**: \`update_node\` 그대로.

의존성(\`add_dependency\`/\`remove_dependency\`)과 시나리오 스텝은 ID를 참조하므로, ID가 유지되면 아무것도 안 해도 자동으로 유효한 상태가 유지돼. \`delete_node\`는 정말로 해당 기능이 없어진 경우만 사용.

## 6-C. 탐색 도구

맵 전체를 받아와서 파싱하지 말고, 필요한 노드만 집어서 가져오는 게 효율적이야:

- \`search_nodes\` → 이름/identifier 부분일치 검색. \`query\`와 선택적 \`types\`(배열)을 지정. "로그인 관련 기능", "/dashboard 페이지" 같은 타깃 탐색에 최적.
- \`get_node\` → 특정 노드의 전체 필드 덤프.
- \`get_service_map\` → 전체 스냅샷. 초기 분석이나 대규모 변경 전 컨텍스트 수집용.

## 6-D. 파괴적 변경 전 영향도 체크 (필수)

노드 구조나 참조 관계가 바뀌는 작업은 **반드시** \`analyze_impact\`를 먼저 호출해.
"뭐가 깨질지 모르고 진행한다"가 이 서비스의 가장 큰 실패 모드라 이 게이트는 생략 금지.

**대상 작업:**
- \`delete_node\` — 무조건 필수
- \`update_node\` 중 이름(\`name\`), 또는 구조 필드(\`productNodeId\`, \`parentPageId\`, \`pageNodeId\`, \`parentFunctionId\`) 변경
- \`convert_feature_scope\`
- 공유 기능(shared feature)의 \`description\`/\`policy\`를 대규모로 재작성할 때도 권장

**절차:**
1. 작업 대상 노드에 \`analyze_impact(nodeId, nodeType, changeKind)\` 호출.
   \`changeKind\`는 'delete' | 'rename' | 'reparent' | 'rescope' | 'update' 중 가장 가까운 값.
2. 리포트에 \`⚠ Risks\` 섹션이 있으면 **유저에게 요약 전달** 후 진행 여부 확인.
3. 참조가 전혀 없거나 Risks가 비어있으면 확인 없이 진행해도 돼.
4. 변경 완료 후 영향 받은 노드/시나리오가 있었다면 \`add_comment\`로 "왜 바꿨는지" 한 줄 기록.

**안 돼:**
- 시나리오 스텝이 이 노드를 참조하는 걸 안 적은 상태에서 \`delete_node\` 부르는 것
- \`analyze_impact\` 결과를 유저에게 보이지 않고 내부적으로 삼키는 것

## 6-E. AI 컨텍스트 필드 채우기 (\`update_ai_context\`)

각 노드 생성 직후 또는 코드 변경 후 **반드시 update_ai_context 호출**해서 네 가지 필드를 채워. 이건 사람이 편집하지 않고 에이전트가 유지하는 영역이야. 비워두면 다음 세션의 Claude가 또 파일을 헤매.

- \`sourceFiles: string[]\` — 이 노드를 구현하는 파일의 repo-relative 경로. 페이지라면 route 파일 + 주요 컴포넌트, 기능이라면 로직이 있는 파일. 4~8개 이하로 핵심만.
- \`testFiles: string[]\` — 이 노드를 검증하는 테스트 파일. 없으면 빈 배열로 두고, 추후 테스트 추가 시 갱신.
- \`stateTouches: string[]\` — 이 노드가 읽거나 쓰는 **DB 테이블 + 외부 서비스**. 예: \`["users", "sessions", "Stripe API"]\`. analyze_impact 리포트의 \"hidden side effect\" 경고 근거가 됨.
- \`runtimeContext: string[]\` — **파일만 봐선 안 보이는 런타임/배포 사실**. 예: \`["Vercel cron: 0 0 * * *", "Edge runtime", "Background job, every 30s", "Supabase Realtime channel: realtime:notifications", "Webhook entry point — Stripe POST /api/webhooks/stripe"]\`. 없으면 빈 배열.
- \`ioContract\` (기능 노드 전용) — 입력·출력·부수 효과.
  - \`inputs\`: TypeScript-like 시그니처 한 줄. 예: \`email: string, password: string\`
  - \`outputs\`: 반환 shape. 예: \`{ userId: string, sessionToken: string }\`
  - \`sideEffects: string[]\`: 명시적 side effect. 예: \`["users 테이블에 row 추가", "verification email 발송"]\`

빈 배열/문자열을 명시적으로 전달하면 이전 값 제거. 일부 필드만 전달하면 나머지는 그대로 유지.

## 7. 필드 작성 규칙

### name
- 사람이 읽는 이름. 언어 정책(§8) 적용
- 고유명사는 영문 그대로 (GitHub, Stripe, Supabase 등)

### identifier (항상 영문)
- URL 경로 또는 kebab-case 코드명
- 예: \`/login\`, \`stripe-payment\`, \`nav-bar\`, \`auth-callback\`
- **번역 금지**

### description (글머리 기호로 작성)
- 한 줄로 쭉 쓰지 말고 **글머리 기호(•, -)로 항목별 정리**. 사람이 훑어보기 쉬움.
- 코드에서 직접 확인한 동작만 서술. **구체적인 호출·파일명·인자** 포함.
- 예시 (좋음):
  \`\`\`
  • app/login/page.tsx에서 supabase.auth.signInWithOAuth 호출
  • provider: github
  • 성공 시 /auth/callback → 세션 쿠키 설정 → /dashboard 이동
  \`\`\`
- 예시 (나쁨 — 절대 쓰지 말 것):
  - "사용자 경험을 개선합니다"
  - "Supabase를 통한 소셜 로그인" (→ 어느 소셜? 뭉치지 말 것)

### policy (글머리 기호로 작성)
- **코드에 실제로 enforce되는** 비즈니스 규칙만
- 여러 규칙이 있으면 글머리 기호로 정리:
  \`\`\`
  • 1회 결제 한도: MAX_CHARGE 환경변수 (초과 시 422)
  • 일일 한도: 사용자당 최대 10회
  • 환불: 결제 후 7일 이내만 가능
  \`\`\`
- **컨텍스트별 활성화 조건**: 기능이 특정 상황에서만 활성화되면 반드시 명시
  - 역할 기반: \`editor+ 역할 필요\`, \`owner 전용\`
  - 모드 기반: \`프로젝트 모드 전용\`, \`readOnly 시 비활성\`
  - 환경 기반: \`조직 서비스맵 전용\`, \`모바일 비활성\`
  - 예: \`개인맵: 소유자만 | 조직맵: editor/owner | 프로젝트 모드: 자동 추가 | MCP 잠금 중 비활성\`
- 유추/추측 금지. 코드에 없으면 **빈칸**

## 8. 언어 정책 ⚠️ (가장 중요)

- \`description\` 필드: 반드시 **${languageLabel}**로 작성
- \`policy\` 필드: 반드시 **${languageLabel}**로 작성
- \`identifier\` 필드: 항상 영문 (URL/코드 경로 그대로, 번역 금지)
- \`name\` 필드: ${nameRule}

레포가 영어 코드 / 영어 README라 해도 위 정책을 **우선**해.
내부 변수명이나 코드 주석을 그대로 description에 옮기지 말고,
${languageLabel}로 요약해서 자연스러운 문장으로 재작성해.

## 9. 노드 수 제한 및 진행 보고

- **목표: 1회 실행에 80개 노드 이내** — 디테일이 우선, 묶기는 금지
- 분석 결과 80개 넘을 것 같으면 **중단**하고 사용자에게 안내:
  "레포가 커서 한 번에 담기 어렵습니다. \`scope\` 인자로 디렉토리를 나눠 여러 번 실행하세요. 예: \`bootstrap_from_repo(scope='app/dashboard')\`"
- **노드 수를 줄이려고 서로 다른 외부 서비스나 기능을 합치지 말 것**.
  GitHub OAuth + Google OAuth를 "Auth"로 뭉치기 < 둘 다 만들고 scope로 쪼개 재실행
- 매 10개 노드 생성마다 한 줄 보고:
  "진행: products 1, pages 5, features 14 생성 완료. 다음은 \`/api/*\` 시스템 노드"

## 10. 반-환각 원칙 🚨

코드에서 확인한 내용만 쓴다. 다음은 **절대 금지**:

- 공허한 마케팅 문구 ("사용자 친화적", "더 나은 경험")
- 코드에 없는 정책 창작 ("환불은 7일 이내" 같은 걸 코드에서 확인 못 했으면 쓰지 말 것)
- README에 없는 프로덕트 설명 창작
- **불확실하면 빈칸**. 빈칸은 나중에 사용자(PM)가 보강함

## 11. 끝난 후 검증 및 리포트

모든 노드·의존성 생성이 끝나면 **먼저 자가 점검**:

> 🧭 **자문**: 이 서비스를 처음 써보는 PM이 스크린샷을 보며 손가락으로
> 가리킬 만한 UI 요소(패널, 사이드바, 드래그, 단축키, 컨텍스트 메뉴,
> 실시간 동기화 등)를 모두 노드로 만들었는가? 코드 레벨 feature(server
> action, SDK 호출)만 잡고 인터랙션 feature(§3 B카테고리)를 빠뜨리는 게
> 이 prompt의 가장 흔한 실패야.
>
> 빠진 게 떠오르면 리포트 전에 추가 생성 한 사이클 더 돌려라.

그 다음:

1. \`get_service_map\`을 다시 호출해서 최종 상태 확인
2. 다음 요약을 출력:
   - **총 노드 수** (products/pages/features 내역 + system 노드 수)
   - **의존성 엣지 수**
   - **shared function으로 판정된 노드 리스트** (사용자가 재검토할 수 있도록 이유와 함께)
   - **\`policy\` 필드가 빈 노드 수와 ID 목록** (사용자가 보강해야 할 대상)
   - **고아 노드 (import 관계가 없어 의존성이 0인 것) 리스트**
3. 사용자에게 안내:
   "초기 bootstrap 완료. 특히 다음을 검토해주세요:
   - shared 판정이 맞는지 (위 목록 참고)
   - 빈 policy 필드 보강
   - 부족한 description은 직접 수정"
${scopeSection}${dryRunSection}
---

준비됐으면 **§0부터 순서대로** 시작해.`
}
