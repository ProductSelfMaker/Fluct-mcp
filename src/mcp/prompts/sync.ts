/**
 * Builds the system-prompt text for the MCP `sync_from_repo` prompt.
 *
 * Unlike `bootstrap_from_repo` which assumes a blank map and creates
 * everything from scratch, `sync_from_repo` assumes an existing map
 * built from a previous bootstrap and reconciles it against the
 * current repo state:
 *
 *   - ADD: nodes present in code but not in the map
 *   - UPDATE: nodes whose identifier matches but whose description /
 *             endpoint / parent has drifted
 *   - REMOVE candidate: nodes in the map whose code anchor has
 *             disappeared — **never auto-deleted**, always proposed
 *             for the user to confirm
 *
 * The prompt is deliberately short: it leans on the bootstrap prompt's
 * §1–§5 (read order, external-API splitting, shared-function algorithm)
 * rather than restating them. An AI client that has invoked bootstrap
 * before will already know those rules; clients that haven't can read
 * them in the docs page or run bootstrap first.
 *
 * The hard invariant: **manual nodes are never touched**. If a node's
 * identifier doesn't look like something bootstrap would have produced
 * (URL path, SDK method string), sync treats it as user-curated and
 * leaves it alone, even if it has no apparent code anchor.
 */

export type SyncLanguage = 'ko' | 'en'

export interface SyncPromptArgs {
  /** Output language for description/policy fields. Defaults to 'ko'. */
  language?: SyncLanguage
  /** Optional directory to restrict re-scanning to. */
  scope?: string
  /** If true: output plan only, never ask for approval, never write. */
  dryRun?: boolean
  /** GitHub repo in "owner/repo" format for remote analysis without local code. */
  githubRepo?: string
}

export function buildSyncPrompt(args: SyncPromptArgs = {}): string {
  const language: SyncLanguage = args.language ?? 'ko'
  const scope = args.scope?.trim() || null
  const dryRun = !!args.dryRun
  const githubRepo = args.githubRepo?.trim() || null

  const languageLabel = language === 'ko' ? '한국어' : 'English'

  const scopeSection = scope
    ? `
## 🎯 재스캔 범위 제한 (이번 실행 한정)

이번에는 **\`${scope}\` 디렉토리만** 재스캔해. 그 외 디렉토리의 노드는
ADD/UPDATE/REMOVE 후보에 포함시키지 마. 범위 밖 노드는 "sync 대상 아님"으로
간주하고 그대로 둬.
`
    : ''

  const dryRunSection = dryRun
    ? `
## ⚠️ DRY RUN 모드 (이번 실행 한정)

이번 실행은 **plan-only** 모드야:

- diff를 계산해서 아래 §4 포맷으로 출력만 해
- 사용자에게 승인을 묻지 마
- 어떤 write tool (\`create_*\`, \`update_node\`, \`delete_node\`, \`add_dependency\` 등)도 **절대 호출하지 마**
- 출력 말미에 안내: "이 계획을 실제로 적용하려면 dry_run 인자 없이 다시 실행해주세요."
`
    : `
## 승인 후 적용

§4에서 리뷰 결과를 출력한 다음, 사용자에게 **명시적으로 물어봐**:

\`\`\`
위 계획을 적용할까요?
  (a) 전체 적용
  (b) ADD와 UPDATE만 적용 (REMOVE는 스킵)
  (c) 일부만 적용 — 적용할 항목 번호를 알려주세요
  (d) 취소
\`\`\`

사용자가 명확히 "적용" 의사를 밝히기 전까지는 **어떤 write tool도 호출하지 마**.
승인 후 §5 순서로 적용해.
`

  return `이 레포의 코드를 재분석해서 Fluct 서비스맵의 **증분 업데이트**를 수행해줘.
전제: 이 맵은 이미 \`bootstrap_from_repo\`로 초기 구축돼 있음. 지금은 그 이후
코드 변경사항(새 라우트, 삭제된 기능, 파일 이동 등)을 맵에 반영하는 작업이야.

## 0. 시작 전

1. \`fluct.get_service_map\`을 호출해서 **현재 맵 전체**를 메모리에 올려.
   - 맵이 비어있으면 즉시 중단하고 안내: "맵이 비어 있습니다. 먼저
     \`bootstrap_from_repo\`를 실행하세요."
2. 코드 접근을 확인해:
   - 로컬 파일시스템 접근이 가능하면 바로 아래 재스캔 단계로.
   ${
     githubRepo
       ? `- **GitHub 레포가 지정됨: \`${githubRepo}\`** — WebFetch로 GitHub API를 사용해 분석해.
     \`GET https://api.github.com/repos/${githubRepo}\` 로 기본 브랜치 확인 →
     \`GET https://api.github.com/repos/${githubRepo}/git/trees/<branch>?recursive=1\` 로 트리 획득 →
     \`https://raw.githubusercontent.com/${githubRepo}/<branch>/<path>\` 로 개별 파일 읽기.`
       : `- 로컬 접근이 안 되면 사용자에게 GitHub URL(\`owner/repo\`)을 받아
     GitHub API로 분석하거나, 핵심 파일 붙여넣기를 요청해.`
   }
3. repo를 bootstrap과 **동일한 규칙**으로 재스캔:
   - §1 읽기 순서 (package.json → README → .env.example → 라우트 트리)
   - §2 무시 경로
   - §3 feature 분류 — 특히 **B 카테고리 "인터랙션 feature"**(패널, 드로어,
     사이드바, 드래그, 단축키, 컨텍스트 메뉴 등)를 빠뜨리지 마. 이건
     bootstrap에서도 가장 흔한 누락 카테고리야
   - §5 외부 API 분별 (SDK 기준 아닌 서비스 기준으로 split)

   bootstrap 프롬포트를 본 적 없다면 Fluct 문서의 bootstrap 섹션을 먼저 읽어와.

## 1. 매칭 규칙 (절대 이름이 아닌 \`identifier\`로 매칭)

현재 맵의 노드와 코드에서 감지된 노드를 짝지을 때 **오직 \`identifier\`만** 사용:

| 노드 타입 | 매칭 키 |
|---|---|
| product | 단일 노드 가정 — 무조건 기존 product 재사용 |
| page | \`identifier\` (URL 경로, 예: \`/dashboard\`, \`/api/mcp\`) |
| feature (function) | 부모 페이지 + \`identifier\` (kebab-case 코드명) |
| feature (external_api) | \`identifier\` (SDK 메서드 경로 또는 도메인) |

**이름(\`name\`)으로 매칭하지 마**. AI가 다르게 표현할 수 있어서 불안정해.

## 2. diff 분류

### ADD 후보 (코드에 있는데 맵에 없음)
- 새 페이지: \`app/\` 트리에 새 route가 생겼지만 매칭되는 page 노드 없음
- 새 기능: 새 server action, 새 SDK 호출, 새 OAuth provider 등
- 새 external API: \`.env.example\`에 새 환경변수 + 대응되는 SDK 호출
- **누락된 인터랙션 feature**: 기존 bootstrap이 놓쳤을 가능성이 있는 패널,
  사이드바, 드래그, 단축키, 컨텍스트 메뉴 등(§3 B카테고리). 코드가 새로
  추가된 게 아니더라도, 현재 맵에 해당 identifier가 없으면 ADD 후보로 올려라.
  sync는 "코드 변경 반영"뿐 아니라 "이전 bootstrap의 누락 보완" 역할도 해

### UPDATE 후보 (identifier는 같은데 내용이 드리프트됨)
- \`description\` 속 파일 경로가 이동/리네임됨
- feature의 \`endpoint\` 필드가 변경됨 (예: \`stripe.v2.*\` → \`stripe.v3.*\`)
- page의 kind가 \`page\` → \`system\`으로 바뀜 (또는 반대)
- 부모 관계가 바뀜 (shared → page-scoped 또는 반대)
- **\`policy\` 필드는 건드리지 마** — 사용자가 직접 채워 넣은 지식이라 드리프트
  판단이 어렵고, 덮어쓰면 유저 작업을 지우게 돼

### REMOVE 후보 (맵엔 있는데 코드 anchor 없음)
⚠️ 아래 **모든** 조건을 만족할 때만 REMOVE 후보로 올려:
1. \`identifier\`가 "자동 bootstrap이 만들 법한 형태"임:
   - page: URL 경로 형태 (\`/\`로 시작)
   - feature: SDK 메서드 체인 (\`sdk.namespace.method\`) 또는 URL 도메인
2. 현재 repo 스캔에서 해당 anchor에 대응되는 코드가 전혀 없음
3. 해당 노드의 \`description\`에 파일 경로 참조가 남아 있는데 그 파일이 없음

위 조건 중 하나라도 불확실하면 REMOVE 후보에 올리지 말고 **그대로 둬**.
사람이 직접 만든 노드·메모·그룹핑은 sync의 적용 대상이 아니야.

### 리네임 감지
ADD와 REMOVE 후보가 다음을 공유하면 "리네임 가능성"으로 별도 섹션에 표시:
- 같은 부모 페이지
- 같은 kind (function/external_api)
- description이 70% 이상 유사

이런 경우 사용자에게 "리네임인가요? 아니면 정말 삭제+추가인가요?" 라고 물어봐.
멋대로 판단해서 delete+create 하면 dependency 엣지가 전부 끊어져.

## 2-B. AI 컨텍스트 필드 동기화 (\`update_ai_context\`) 🧠

이건 사람이 아닌 **AI 에이전트가 유지하는 메타데이터**야. sync는 반드시 이
필드를 채워/갱신해. 비워두면 다음 세션의 AI가 또 파일을 헤매.

각 노드마다 \`get_node\`로 현재 \`ai_context\`를 조회한 뒤, 아래 네 필드를
현재 repo 기준으로 계산해서 비교:

- \`sourceFiles: string[]\` — 이 노드를 구현하는 파일의 repo-relative 경로
  (예: \`app/login/page.tsx\`, \`lib/auth.ts\`). 4~8개 이하로 핵심만.
- \`testFiles: string[]\` — 이 노드를 검증하는 테스트 파일. 없으면 \`[]\`.
- \`stateTouches: string[]\` — 이 노드가 읽거나 쓰는 DB 테이블 + 외부 서비스
  (예: \`["users", "sessions", "Stripe API"]\`).
- \`runtimeContext: string[]\` — 파일 안에 안 보이는 런타임/배포 사실
  (cron 일정, Edge runtime, background job, Realtime 채널, webhook
  entry point 등). 예: \`["Vercel cron: 0 0 * * *", "Edge runtime"]\`.
- \`ioContract\` (기능 노드 전용): \`{ inputs?: string, outputs?: string,
  sideEffects?: string[] }\`. TypeScript-like 한 줄 시그니처.

diff 판정:
- **AI_CONTEXT_FILL**: 노드의 \`ai_context\`가 비어있거나(\`{}\`) 일부만 차 있을
  때 — 부족한 필드를 채우기.
- **AI_CONTEXT_DRIFT**: 기록된 \`sourceFiles\`/\`testFiles\`가 실제 repo에
  존재하지 않거나 이동됨 → 현재 경로로 갱신.
- **AI_CONTEXT_OK**: 모든 필드가 최신이면 건드리지 마.

ADD로 새로 만든 노드는 **생성 직후에 반드시** \`update_ai_context\` 호출해서
네 필드를 채워. UPDATE 대상 노드도 description/endpoint 갱신 직후 바로
\`update_ai_context\`로 변경된 파일 경로 반영.

\`update_ai_context\`는 partial merge — 전달한 필드만 갱신하고 나머지는
유지. 명시적으로 클리어하려면 빈 배열(\`[]\`) 또는 빈 문자열 전달.

## 3. 의존성 엣지 재계산

노드 diff를 먼저 확정한 후, 의존성 엣지는 다음처럼 처리:
- **ADD 엣지**: 새로 감지된 import/호출 관계 중 아직 맵에 없는 것
- **REMOVE 엣지**: 맵엔 있는데 이제 해당 코드가 없는 것 — 단, **양쪽 끝 노드가
  모두 유지되는 경우에만 REMOVE 후보**로 올려. 한쪽이 REMOVE 중이면 어차피
  cascade로 정리되므로 따로 리스트하지 마.
- 엣지 방향(\`masterId\`)이 기존과 다르면 UPDATE 후보로 분류

## 4. 리뷰 출력 (승인 전 필수)

아래 형식을 **정확히** 사용해서 출력해. 사용자가 훑어보고 승인/거절을 결정함.

\`\`\`markdown
# Sync 계획

**현재 맵**: {productName} — nodes: {n}, edges: {e}
**코드 재스캔 범위**: {scope 또는 "전체"}

## ADD ({count})
1. [page] \`/dashboard/billing\` — Billing 페이지. \`app/dashboard/billing/page.tsx\`
2. [feature/external_api] Stripe Customer Portal — \`stripe.billingPortal.sessions.create\`
...

## UPDATE ({count})
1. [page] \`/login\` — description 갱신: 파일 경로가 \`app/(auth)/login/page.tsx\`로 이동
2. [feature] GitHub OAuth — endpoint 변경: \`supabase.auth.signInWithOAuth({ provider: 'github' })\`
...

## AI 컨텍스트 동기화 ({count})
- [feature] \`auth\` — sourceFiles 2개 추가, stateTouches=["users","sessions"] 신규
- [page] \`/dashboard\` — sourceFiles 드리프트: \`app/dashboard/page.tsx\`는 그대로지만 이전 기록의 \`lib/dashboard.ts\` 삭제됨
...

## REMOVE 후보 ({count})  ⚠️ 수동 확인 필요
1. [page] \`/legacy/admin\` — \`app/legacy/admin/page.tsx\` 파일이 더 이상 존재하지 않음
2. [feature/external_api] Twilio SMS — \`twilio\` SDK import가 repo 전체에서 사라짐
...

## 리네임 가능성 ({count})  ⚠️ 사용자 판단 필요
- [feature] REMOVE "Stripe Charges" + ADD "Stripe Payment Intents" — 같은 페이지 하위,
  동일 결제 도메인. 리네임인지 교체인지 확인 필요.

## Dependency 변경
- ADD: {n}개 (신규 import/호출)
- REMOVE: {n}개 (사라진 연결, 양쪽 노드 모두 유지)
- 방향 변경: {n}개

## 건드리지 않은 것
- 수동 생성으로 보이는 노드: {n}개 (identifier가 URL/SDK 패턴 아님)
- policy 필드: 전부 유지 (sync가 덮어쓰지 않음)
\`\`\`

## 5. 적용 순서 (승인 후)

사용자 승인을 받은 후에만 이 단계로 진입. 순서를 지켜야 참조 무결성이 깨지지 않음:

a. **ADD 페이지** — 상위 페이지부터 (\`create_page\`)
b. **ADD 기능** — page-scoped 먼저, shared 다음 (\`create_feature\`)
c. **UPDATE** — \`update_node\`로 description/endpoint/kind/parent 갱신
d. **AI 컨텍스트 채우기/갱신** — 모든 ADD·UPDATE·FILL·DRIFT 대상 노드에
   대해 \`update_ai_context\` 호출. 이 단계 빠뜨리면 sync의 핵심 가치
   (AI가 코드 위치를 안다)가 사라짐.
e. **ADD 의존성 엣지** — \`add_dependency\` 일괄
f. **REMOVE 의존성 엣지** — \`remove_dependency\`
g. **REMOVE 노드** — cascade 피하려고 리프부터 (엣지 먼저 정리됨)

## 6. 언어 정책 ⚠️

- 새로 만드는 노드의 \`description\`은 반드시 **${languageLabel}**로 작성
- UPDATE로 갱신하는 description도 기존 언어와 동일하게 유지 (섞지 마)
- \`identifier\`는 항상 영문 (URL/코드 경로 그대로)
- \`policy\`는 건드리지 않음 (§2 UPDATE 규칙)

## 7. 반-환각 원칙 🚨

- description에 지어낸 경로·파일명 쓰지 마. 코드에서 직접 확인한 것만.
- REMOVE 후보는 "코드 anchor가 사라졌다"가 **확실한** 경우만. 추측 금지.
- 불확실하면 UPDATE/REMOVE 후보에서 빼고 **그대로 둬**.

## 8. 노드 수 제한

sync도 한 번에 80개 변경 이내로 유지. 넘으면 중단하고 안내:
"변경 규모가 커서 한 번에 처리하기 어렵습니다. \`scope\` 인자로 디렉토리를
나눠 여러 번 실행하세요."
${scopeSection}${dryRunSection}
---

준비됐으면 **§0부터 순서대로** 시작해.`
}
