# SmartFoodRoute — Project Process & Handoff Log

> **File mục đích**: dùng để handoff toàn bộ bối cảnh dự án SmartFoodRoute sang một ChatGPT/Codex session mới.  
> **Tên file**: `process-gpt-smartfoodroute.md`  
> **Cập nhật gần nhất**: 2026-09-20  
> **Trạng thái hiện tại**: Prompt 1B đã chạy và hoàn tất phần implementation/migration Phase 0–4 theo v3. Supabase live/security đã PASS. Còn 2 live-provider blockers: MapTiler key + Geoapify Edge secret. Chưa sang Prompt 2 cho tới khi 2 live checks này PASS.

---

# 1. CÁCH DÙNG FILE NÀY KHI MỞ CHAT MỚI

Khi mở một ChatGPT session mới, hãy upload:

1. `process-gpt-smartfoodroute.md`
2. `implementation.md` mới nhất (v3.0)
3. `PROGRESS.md` từ repository nếu có
4. nếu cần: `prompt_1b.md`

Sau đó nói:

> Đọc toàn bộ `process-gpt-smartfoodroute.md`, `implementation.md` và `PROGRESS.md`. Đây là handoff của dự án SmartFoodRoute từ session trước. Hãy tiếp tục đúng từ trạng thái hiện tại, không làm lại những phần đã hoàn thành.

**Ưu tiên nguồn thông tin:**

```text
1. implementation.md v3.0 = source of truth kỹ thuật
2. PROGRESS.md = trạng thái thực tế trong repository
3. repository + git diff/log/tests = bằng chứng thực tế
4. process-gpt-smartfoodroute.md = lịch sử quyết định + handoff
```

Nếu có khác biệt giữa file này và repository thực tế, **repository + `PROGRESS.md` + test results mới nhất được ưu tiên cho trạng thái implementation**.

---

# 1B. QUICK START — CHỈ UPLOAD FILE NÀY Ở SESSION CHATGPT MỚI

Nếu mở một ChatGPT session mới và **chỉ upload file này**, hãy nói:

> Đọc toàn bộ `process-gpt-smartfoodroute.md`. Đây là handoff đầy đủ của SmartFoodRoute từ các session trước. Hãy tiếp tục đúng từ trạng thái CURRENT SNAPSHOT mới nhất trong file, không làm lại phần đã hoàn thành. Nếu tôi vừa chạy Codex thêm sau snapshot này thì hãy yêu cầu tôi gửi `PROGRESS.md` mới nhất để đối chiếu trước khi hướng dẫn bước tiếp theo.

Quy tắc cho assistant ở session mới:

1. **Ưu tiên CURRENT SNAPSHOT 2026-09-20 bên cuối file cho trạng thái hiện tại.**
2. `implementation.md v3.0` vẫn là source of truth kỹ thuật nếu được cung cấp lại; nếu chưa có thì dùng các quyết định kiến trúc đã ghi trong file này và không tự đổi architecture.
3. Không restart project, không chạy lại Prompt 1/Prompt 1B từ đầu.
4. Không sang Phase 5/Prompt 2 trước khi MapTiler live + Geoapify live PASS.
5. Không yêu cầu user paste API key/secret vào chat.
6. Sau mỗi lần Codex chạy thêm, nên xin `PROGRESS.md` mới nhất để cập nhật trạng thái thực tế.

**Lưu ý lịch sử:** một số section cũ bên dưới phản ánh trạng thái trước khi Prompt 1B chạy. Phần `# 39. CURRENT SNAPSHOT` trở đi **supersede** các mô tả trạng thái cũ nếu có mâu thuẫn.

---

# 2. MỤC TIÊU SẢN PHẨM

Tên dự án:

```text
SmartFoodRoute
```

Đây là web app mobile-first để hỗ trợ lên lịch đi chơi/ăn uống/hẹn hò.

Core use case:

```text
Chọn điểm xuất phát
→ chọn quán ăn
→ chọn photobooth / hoạt động
→ chọn rạp phim
→ xem phim đang chiếu + suất chiếu
→ chọn suất phim
→ app tính ngược giờ nên xuất phát
→ tự sắp ăn / chơi / photobooth / phim / cafe hợp lý
→ route ngắn/hợp lý
→ không trễ giờ phim
→ xem timeline + budget
→ mở Google Maps để xem review
→ mở Moveek để đặt vé
→ lưu / share tour
```

Điểm đặc biệt:

- Cinema showtime là **fixed-time anchor**.
- Route không chỉ tối ưu km; ưu tiên **feasible schedule + travel duration**.
- Có **backward scheduling** từ giờ phim.
- Sau đó phải **forward validate** lại toàn lịch trình.
- Private place như “Nhà tôi”, “Nhà cô ấy” không được leak exact location khi share.

---

# 3. FILE KẾ HOẠCH BAN ĐẦU VÀ REVIEW KỸ THUẬT

Ban đầu user có `implementation.md` phiên bản cũ dùng:

- React + TypeScript + Vite
- Supabase
- Google Maps JavaScript API
- Google Places
- Directions / Distance Matrix
- custom markers
- MFA
- saved places / tours
- share token
- route optimizer

Sau technical review, các vấn đề quan trọng được phát hiện:

## 3.1. RLS share token không an toàn

Policy cũ kiểu:

```sql
share_token IS NOT NULL
```

có nguy cơ khiến mọi shared tour bị đọc được thay vì chỉ tour đúng token.

Quyết định sửa:

```text
Public client
→ RPC / secure function
→ validate token
→ fetch đúng 1 tour
→ redact private data
```

Không anonymous SELECT trực tiếp bảng `saved_tours`.

## 3.2. MFA flow cũ sai bản chất

TOTP không phải first factor.

Flow đúng:

```text
Email/password
→ AAL1
→ TOTP
→ AAL2
```

Frontend guards chỉ là UX.

Database phải enforce AAL2 bằng RLS.

## 3.3. Google routing API cũ/outdated

File cũ dùng:

- DirectionsService
- DirectionsRenderer
- Distance Matrix Service
- legacy Marker

Đã quyết định chuyển sang API mới ở bản Google architecture trước đó.

Sau này toàn Google Maps runtime đã bị loại hoàn toàn vì yêu cầu zero-cost/no billing.

## 3.4. Google Places persistence

Không nên biến Supabase thành bản sao lâu dài của Google Places data.

Ở architecture Google cũ, quyết định là:

- persist Place ID + user metadata
- fetch volatile rating/reviews/photos/opening hours live

Sau khi chuyển sang Geoapify, schema được đổi thành generic provider model.

## 3.5. Node / Tailwind / deployment

Các cập nhật đã chốt:

- Node 24 LTS
- Tailwind v4
- TypeScript strict
- Vercel preferred
- GitHub Pages chỉ optional
- không dùng `base: './'` như default deployment strategy

---

# 4. IMPLEMENTATION.MD V2.1 TRƯỚC KHI ĐỔI KIẾN TRÚC

Một bản `implementation.md` chi tiết đã được tạo, khoảng hơn 4.000 dòng.

Nó bao gồm:

- schema
- RLS
- MFA
- Google Maps / Places
- route optimizer
- Moveek/showtimes
- fixed-time scheduler
- photobooth
- timeline
- budget
- share/QR
- PWA
- testing
- CI/CD
- Definition of Done

Cinema feature được thêm vào như module riêng:

```text
ShowtimeProvider
MoveekProvider
Manual fallback
cinema provider matching
movie picker
showtime picker
booking handoff
freshness/revalidation
```

---

# 5. MOVEEK / CINEMA REQUIREMENT

User muốn:

```text
Chọn rạp
→ app kiểm tra phim đang chiếu / suất chiếu
→ user chọn phim + giờ
→ nếu đặt vé thì mở Safari/browser sang Moveek
→ giờ phim cố định
→ planner tự tính nên đi ăn / photobooth / cafe lúc nào
```

Quyết định kỹ thuật:

- cinema = fixed-time anchor
- Moveek không được scrape/bypass anti-bot bừa bãi
- dùng `ShowtimeProvider` abstraction
- ưu tiên official/permitted source nếu có
- nếu provider lỗi → manual showtime input
- showtime phải có `fetchedAt` và revalidate
- booking luôn external
- app không chọn ghế / thanh toán

---

# 6. CHIẾN LƯỢC CHIA PROMPT CHO CODEX

Không giao toàn bộ project trong 1 mega-prompt.

Đã chốt chia thành 3 đợt lớn:

## Prompt 1

Foundation + Security + Auth + Maps + Places

Scope ban đầu:

```text
PHASE 0 → PHASE 4
```

## Prompt 2

Core intelligence:

- Planner
- route matrix
- optimizer
- Moveek/showtime
- fixed-time scheduler
- photobooth
- opening hours
- Top 3 route

## Prompt 3

Product completion:

- sharing
- QR
- PWA
- Lucky Wheel
- polish
- E2E
- deploy
- final audit

Mỗi session phải dùng `PROGRESS.md` làm persistent memory.

---

# 7. MODEL / EFFORT ĐÃ DÙNG VỚI CODEX

Trong Codex UI, user đã chạy:

```text
Model: GPT-6 Astra
Reasoning: High
```

Đây là cấu hình được chọn trong session này cho Prompt 1.

Không cần restart chỉ vì quota hết.

Nếu quota reset:

- mở lại đúng session
- đọc `implementation.md`
- đọc `PROGRESS.md`
- tiếp tục

---

# 8. PROGRESS.MD CONTRACT

Prompt 1 đã yêu cầu Codex tạo:

```text
PROGRESS.md
```

Nó là persistent project memory.

Format đã yêu cầu:

```md
# SmartFoodRoute — Implementation Progress

## Overall Status

Current Phase:
Current Task:
Last Updated:

## Status Legend

- TODO
- IN_PROGRESS
- DONE
- BLOCKED_EXTERNAL
- BLOCKED_TECHNICAL

## Phase Progress

| Phase | Task | Status | Evidence / Files | Verification | Notes |

## External Blockers
## Technical Blockers
## Decisions Made
## Verification History
## Current Repository State
## Next Action
## Session Handoff
```

Quy tắc:

```text
TODO → IN_PROGRESS → DONE
```

Nếu thiếu credential:

```text
BLOCKED_EXTERNAL
```

Nếu lỗi kỹ thuật:

```text
BLOCKED_TECHNICAL
```

Không fake DONE.

---

# 9. PROMPT 1 ĐÃ CHẠY ĐƯỢC ĐẾN ĐÂU

Codex đã thực sự chạy Prompt 1 trước khi hết quota.

Từ screenshots/log:

## Phase 0

Đã làm và pass:

- Node 24
- Vite/React/TS
- Tailwind v4
- strict TypeScript
- router
- cache/query setup
- missing-config UI
- lint
- typecheck
- unit tests
- build

Status thực tế lúc đó:

```text
PHASE 0 ≈ DONE
```

## Phase 1

Đã làm:

- Supabase schema
- PostgreSQL tests
- RLS
- AAL1 blocking
- user isolation
- owner checks
- share token/privacy checks

Log cho biết:

```text
12 PostgreSQL tests pass
```

Sau đó security review thêm và cuối cùng:

```text
18 SQL tests pass
```

Codex còn tự phát hiện case privacy:

> xóa private place đang được tham chiếu trong tour có thể làm mất dấu riêng tư của snapshot

và đã bổ sung migration/regression test cho case này.

Status:

```text
PHASE 1 ≈ DONE theo architecture cũ, cần re-check schema provider migration ở Prompt 1B
```

## Phase 2

Đã làm:

- email/password
- email confirmation
- password reset
- TOTP enrollment QR
- MFA guards
- session handling
- invalid OTP
- AAL2 logic
- logout cache cleanup
- auth tests

Log:

```text
Phase 2 pass auth/guard tests and build
```

Status:

```text
PHASE 2 ≈ DONE
```

## Phase 3

Đã làm theo Google architecture cũ:

- map loader
- AdvancedMarkerElement
- category markers
- geolocation opt-in
- missing key state
- denial state
- CRUD/map integration

Status:

```text
PHASE 3 cũ gần DONE
NHƯNG phải migrate lại sang MapLibre + MapTiler trong Prompt 1B
```

## Phase 4

Đã làm theo Google Places architecture cũ:

- search
- Places flow
- save/edit/delete
- private place
- reload
- attribution
- live-detail structure
- persistence rules

Log cho biết:

```text
6 Playwright tests pass desktop/mobile
```

Flows test gồm đại ý:

```text
login
→ wrong OTP
→ correct OTP
→ add/edit/delete private place
→ reload
→ logout
→ QR enrollment
```

Status:

```text
PHASE 4 cũ gần DONE
NHƯNG phải migrate lại sang Geoapify trong Prompt 1B
```

---

# 10. CODEX HẾT QUOTA

Codex chạy khoảng:

```text
~36 phút
```

và bị dừng vì usage limit.

Screenshots cho thấy:

```text
You're out of Codex messages
reset time: Sep 20, 2026 3:17 AM
```

Không Undo.

Không reset repo.

Không chạy lại Prompt 1 từ đầu.

Source code hiện tại, 79 edited files và `PROGRESS.md` phải được giữ nguyên.

---

# 11. TẠI SAO KIẾN TRÚC ĐƯỢC ĐỔI KHỎI GOOGLE MAPS PLATFORM

User muốn app:

```text
chỉ mình + bạn dùng
free
không muốn gắn thẻ / không muốn surprise billing
```

Khi bật Google Billing, Google hiển thị temporary card authorization:

```text
~630.000 VND
```

Dù đây là temporary authorization chứ không phải phí, user không muốn theo hướng billing.

Đã đánh giá:

- Apple Maps / MapKit JS: có quota tốt nhưng Apple Developer Program có phí membership
- Google Maps: cần billing account
- OSM public tile server: không phù hợp production trực tiếp
- HERE/TomTom: pricing/billing không phù hợp mục tiêu
- MapLibre + MapTiler + Geoapify: phù hợp nhất cho hobby/free use

Quyết định cuối:

```text
BỎ Google Maps Platform runtime APIs
```

---

# 12. KIẾN TRÚC V3 CUỐI CÙNG

Đã chốt:

```text
Map renderer:
MapLibre GL JS

Basemap:
MapTiler Cloud Free

Places / Geocoding:
Geoapify

Routing:
Geoapify Routing API

Route Matrix:
Geoapify Route Matrix API

Backend / Auth:
Supabase

Cinema:
ShowtimeProvider / Moveek adapter / manual fallback

Google Maps:
external URL shortcut only
```

Không dùng:

```text
Google Maps JS API
Google Places API
Google Routes API
Google Map ID
Google Cloud Billing
```

---

# 13. GOOGLE MAPS REVIEW STRATEGY

User vẫn muốn Google review vì Google có nhiều review hơn.

Không scrape.

Không gọi Google Places API.

Thay bằng:

```text
[Xem đánh giá trên Google Maps]
```

Flow:

```text
Geoapify place
→ name + address
→ Google Maps universal search URL
→ mở Safari / Google Maps app
→ user xem review trực tiếp
```

Optional:

User có thể paste exact:

```text
google_maps_url
```

vào saved place.

Priority:

```text
saved google_maps_url
→ generated name+address URL
→ coordinates fallback
```

No Google API key required.

---

# 14. IMPLEMENTATION.MD V3.0

Đã tạo file mới:

```text
implementation.md v3.0
```

Khoảng:

```text
3363 lines
```

Đây là **source of truth mới duy nhất**.

Nó thay hoàn toàn v2.1.

Các điểm lớn:

- MapLibre
- MapTiler
- Geoapify
- generic provider schema
- no Google runtime API
- Geoapify Edge Function proxy
- Google review external shortcut
- Moveek fixed-time
- scheduler
- route optimizer
- free-tier strategy
- provider degradation
- testing
- migration from old Google implementation
- Prompt 1B acceptance gate

File hiện tại đã được tạo ở session này với tên:

```text
implementation.md
```

---

# 15. SCHEMA V3 QUAN TRỌNG

Provider place model đổi từ Google-specific sang generic.

Target fields:

```text
source = geoapify/custom
provider_place_id
name
address
lat
lng
category
sub_category
notes
tags
privacy
google_maps_url optional
```

Old field:

```text
google_place_id
```

phải migrate an toàn.

Nếu migration cũ chưa apply remote:

- có thể clean khi an toàn

Nếu đã apply:

- forward migration

Không destructive reset database.

---

# 16. GEOAPIFY KEY ARCHITECTURE

Quyết định:

```text
React frontend
→ Supabase Edge Function /geo
→ Geoapify
```

Mục tiêu:

- không expose Geoapify key trong frontend
- centralize rate limit
- validation
- caching
- quota
- adapter abstraction

Secret:

```text
GEOAPIFY_API_KEY
```

Không:

```text
VITE_GEOAPIFY_API_KEY
```

trong production architecture.

---

# 17. MAPTILER KEY ARCHITECTURE

MapTiler key cần browser để render tiles.

Frontend env:

```text
VITE_MAPTILER_API_KEY
```

Phải restrict:

```text
http://localhost:5173
production domain later
```

Không xem MapTiler browser key như admin secret.

---

# 18. SUPABASE ĐÃ SETUP ĐẾN ĐÂU

User đã tạo Supabase project:

```text
Project name: SmartFoodRoute
Region: Southeast Asia / Singapore
```

Security setup lúc tạo project:

```text
Enable Data API: ON
Automatically expose new tables: OFF
Enable automatic RLS: ON
```

## Auth

Đã kiểm tra:

```text
Allow new users to sign up: ON
Allow manual linking: OFF
Allow anonymous sign-ins: OFF
Confirm email: ON
Email provider: Enabled
```

## URL Configuration

Đã cấu hình:

```text
Site URL:
http://localhost:5173

Redirect URL:
http://localhost:5173/**
```

## MFA

Đã cấu hình:

```text
TOTP (App Authenticator): Enabled
Phone MFA: Disabled
```

Maximum factors giữ mặc định.

## Credentials user đã lưu riêng

User đã lưu các mục sau và **đã xóa giá trị khỏi chat**:

```text
Project URL
Publishable Key (sb_publishable_...)
Project Ref
Database password
Supabase Access Token
```

Không lưu secret trong file này.

## Supabase Access Token

User đã tạo token:

```text
SmartFoodRoute-Codex
```

Token được lưu riêng.

Không commit.

Không gửi lại trong chat.

---

# 19. GOOGLE CLOUD STATUS

User đã tạo Google Cloud project:

```text
SmartFoodRoute
Project ID: smartfoodroute
```

Nhưng:

- billing setup chưa hoàn tất
- user dừng lại ở temporary authorization ~630k VND
- sau đó quyết định bỏ Google Maps Platform runtime

Do đó:

```text
Google Cloud project có thể để nguyên
Google billing không cần tiếp tục
Không cần tạo Google Maps API key
Không cần Map ID
Không cần bật Places/Routes
```

Google Quick Builder cũng được xem là không cần.

---

# 20. MAPTILER / GEOAPIFY STATUS

Tại thời điểm file này được tạo:

```text
MapTiler account/API key: CHƯA TẠO
Geoapify account/API key: CHƯA TẠO
```

Đây là external credentials tiếp theo cần chuẩn bị trước Prompt 1B nếu muốn live verification một mạch.

## Cần tạo

### MapTiler

```text
Free account
Project/web key: SmartFoodRoute-Web
Allowed origins:
http://localhost:5173
production domain later
```

Store:

```env
VITE_MAPTILER_API_KEY=
```

### Geoapify

```text
Free account
Project: SmartFoodRoute
API key
```

Store as Supabase secret:

```env
GEOAPIFY_API_KEY=
```

Không expose frontend.

---

# 21. PROMPT 1B

Đã tạo:

```text
prompt_1b.md
```

Khoảng:

```text
799 lines
```

Mục đích của Prompt 1B:

```text
1. Resume Prompt 1 bị quota cắt
2. Không làm lại Phase 0–2
3. Reopen Phase 3–4
4. Migrate Google → MapLibre/MapTiler/Geoapify
5. Migrate schema provider
6. Update tests
7. Live verify Supabase/MapTiler/Geoapify
8. Audit legacy Google
9. Full lint/typecheck/test/build/security
10. Update PROGRESS.md
11. Stop before Phase 5
```

Prompt 1B **đã thay cho prompt resume Prompt 1 cũ**.

Không cần chạy prompt resume cũ trước rồi mới Prompt 1B.

---

# 22. GATE ĐỂ ĐƯỢC SANG PROMPT 2

Không sang Prompt 2 chỉ vì Codex nói “done”.

Phải xem Completion Report và `PROGRESS.md`.

Expected:

```text
PHASE 0: DONE
PHASE 1: DONE
PHASE 2: DONE
PHASE 3 MapLibre/MapTiler: DONE
PHASE 4 Geoapify: DONE

Supabase live: PASS
MapTiler live: PASS
Geoapify live: PASS

Lint: PASS
Typecheck: PASS
Unit: PASS
SQL/RLS: PASS
Integration: PASS
Playwright: PASS
Build: PASS
Security audit: PASS
```

MFA có thể là:

```text
MANUAL_VERIFICATION_REQUIRED
```

nếu cần Google Authenticator thật.

Nếu manual test TOTP pass thì gate được xem là đạt.

Nếu MapTiler/Geoapify:

```text
BLOCKED_EXTERNAL
```

thì chưa nên sang Prompt 2.

---

# 23. PROMPT 2 DỰ KIẾN SẼ LÀM GÌ

Sau khi Prompt 1B pass:

```text
PHASE 5 — Planner UI
PHASE 6 — Cinema/Showtime
PHASE 7 — Route Matrix + Scheduler
PHASE 8 — Final Route + Timeline + Budget
```

Core tasks:

- planner state
- select start / food / cafe / activity
- Geoapify Route Matrix
- Haversine prefilter
- fixed showtime
- backward scheduling
- forward validation
- opening hours
- photobooth
- Top 3 routes
- final Geoapify route
- MapLibre polyline
- timeline
- budget

Prompt 2 chưa được viết ở thời điểm file này được tạo.

---

# 24. PROMPT 3 DỰ KIẾN

Sau Prompt 2:

```text
PHASE 9 — Sharing
PHASE 10 — External Handoffs
PHASE 11 — PWA / Lucky Wheel / Polish
PHASE 12 — Production Audit
```

Bao gồm:

- save/share tour
- secure token RPC
- QR
- privacy redaction
- Google Maps review links
- Moveek booking
- TikTok/Facebook shortcuts
- PWA
- animations
- E2E
- deploy
- final audit

---

# 25. CURRENT ROADMAP STATE

Tại thời điểm handoff:

```text
PHASE 0 — Foundation
Old Prompt 1 implementation: essentially complete
v3 impact: minimal
Expected after Prompt 1B: DONE

PHASE 1 — Supabase + Security
Old implementation: essentially complete
18 SQL tests reported pass
v3 impact: provider schema migration / re-check
Expected after Prompt 1B: DONE

PHASE 2 — Auth + MFA
Old implementation: essentially complete
v3 impact: none/minimal
Expected after Prompt 1B: DONE

PHASE 3 — Map
Old: Google Maps / Advanced Marker
NEW: MapLibre + MapTiler
Status: MUST REOPEN / MIGRATE

PHASE 4 — Places
Old: Google Places
NEW: Geoapify
Status: MUST REOPEN / MIGRATE

PHASE 5+
Not started
```

---

# 26. DO NOT DO

Future assistant / Codex should NOT:

- restart project from scratch
- undo the 79 files from Prompt 1
- delete `PROGRESS.md`
- reuse Google Maps runtime API
- enable Google billing unnecessarily
- scrape Google Maps reviews
- expose Geoapify key in Vite
- expose Supabase access token
- expose database password
- expose service_role key
- rewrite applied migrations destructively
- mark live provider tests DONE using only mocks
- start Phase 5 before Prompt 1B gate passes

---

# 27. IMPORTANT SECURITY DECISIONS

## Supabase

```text
Frontend:
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

CLI/server only:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
DATABASE_PASSWORD
```

Never:

```text
VITE_SUPABASE_ACCESS_TOKEN
VITE_DATABASE_PASSWORD
VITE_SERVICE_ROLE
```

## Geoapify

Preferred:

```text
Supabase Edge secret:
GEOAPIFY_API_KEY
```

## MapTiler

Browser-safe application key:

```text
VITE_MAPTILER_API_KEY
```

Must origin restrict.

---

# 28. PRIVATE LOCATION POLICY

Places such as:

```text
Nhà tôi
Nhà cô ấy
Điểm đón riêng tư
```

default private.

Public share must not expose:

```text
exact lat/lng
exact address
private label if sensitive
```

Use safe public label:

```text
Điểm bắt đầu riêng tư
```

Private place deletion must not accidentally declassify historical tour snapshots.

This exact regression was identified by Codex and tests were added during Prompt 1.

---

# 29. ROUTE ALGORITHM FINAL PRINCIPLES

Hard constraints first:

```text
showtime deadline
opening status if known
required activity order
arrival buffer
user time window
provider route feasibility
```

Primary objective:

```text
min total travel duration
```

Tie-break:

```text
distance
waiting
preferences
budget
```

Default:

```text
do not count route back to start
```

unless “return home” is an explicit stop.

---

# 30. OPENING HOURS LIMITATION UNDER GEOAPIFY

Geoapify/OSM may have less complete opening-hours data than Google.

Status model:

```text
OPEN
CLOSED
CLOSING_SOON
UNKNOWN
```

UNKNOWN is not CLOSED.

UI should say:

```text
Chưa có dữ liệu giờ mở cửa — nên kiểm tra trước khi đi.
```

Google Maps external shortcut can help user manually verify.

User override may be stored.

---

# 31. FREE-TIER STRATEGY

Goal:

```text
mandatory API cost ≈ $0
```

Architecture:

```text
Supabase Free
MapLibre OSS
MapTiler Free
Geoapify Free
Vercel Free
Moveek external/provider
Google Maps URL only
```

Important:

Free tiers can change.

Do not hard-code exact quota into business logic.

Handle:

```text
429 quota
provider downtime
map tile failure
route failure
```

Gracefully.

---

# 32. CURRENT FILES GENERATED IN CHAT

Latest generated files:

```text
implementation.md
→ v3.0
→ new source of truth
→ ~3363 lines

prompt_1b.md
→ migration/resume prompt
→ ~799 lines

process-gpt-smartfoodroute.md
→ this handoff file
```

Older backup files may exist but should not be used as current source of truth.

---

# 33. EXACT NEXT STEPS

## Next step A — Prepare external providers

Before Codex resumes:

1. Create MapTiler Free account.
2. Create MapTiler key.
3. Restrict origin:
   ```text
   http://localhost:5173
   ```
4. Create Geoapify Free account/project.
5. Generate Geoapify key.
6. Prepare it as Supabase Edge secret.

Do not paste keys into chat.

## Next step B — Replace implementation.md in repo

Replace old:

```text
implementation.md v2.x
```

with:

```text
implementation.md v3.0
```

Keep:

```text
PROGRESS.md
source code
tests
migrations
git state
```

## Next step C — Wait for Codex quota reset

Open same Codex session.

Do not run old Prompt 1.

Use:

```text
prompt_1b.md
```

## Next step D — Review completion report

Only continue when Phase 0–4 gate passes.

## Next step E — Write/run Prompt 2

Once Prompt 1B has passed, ask ChatGPT to generate Prompt 2 based on:

```text
implementation.md v3.0
PROGRESS.md
Prompt 1B Completion Report
```

---

# 34. IF CODEX PROMPT 1B HITS QUOTA AGAIN

Do not panic.

Before quota ends, `PROGRESS.md` should checkpoint state.

After reset, use:

```text
Read implementation.md v3.0 and PROGRESS.md.
Inspect git status/diff/log.
Continue the first incomplete task from Prompt 1B.
Do not redo DONE tasks.
Do not start Phase 5.
Before ending, run verification and update Session Handoff.
```

---

# 35. WHAT A NEW CHATGPT SESSION SHOULD DO FIRST

When this file is uploaded in a new session, assistant should:

1. confirm it understands the handoff;
2. ask for / inspect `implementation.md` and `PROGRESS.md` if not attached;
3. identify current gate:
   ```text
   Prompt 1B migration / Phase 3–4
   ```
4. do not suggest old Google architecture;
5. help finish:
   ```text
   MapTiler setup
   Geoapify setup
   Prompt 1B
   Completion review
   Prompt 2
   ```
6. preserve all Supabase setup already completed.

---

# 36. SESSION SUMMARY IN ONE SCREEN

```text
SmartFoodRoute
│
├── Product
│   ├── Food / cafe / photobooth / cinema planner
│   ├── Fixed movie showtime
│   ├── Backward departure-time calculation
│   ├── Route optimizer
│   └── Share / PWA later
│
├── Backend
│   └── Supabase
│       ├── project created Singapore
│       ├── email/password
│       ├── confirm email
│       ├── TOTP MFA
│       ├── URL config
│       ├── access token created
│       └── credentials saved privately
│
├── Map architecture v3
│   ├── MapLibre
│   ├── MapTiler Free
│   ├── Geoapify Places
│   ├── Geoapify Matrix/Routing
│   └── Google Maps URL only
│
├── Codex Prompt 1
│   ├── Phase 0 done
│   ├── Phase 1 done-ish / 18 SQL tests
│   ├── Phase 2 done
│   ├── Phase 3 Google old implementation
│   ├── Phase 4 Google old implementation
│   ├── 6 Playwright tests reported
│   └── quota exhausted
│
├── Architecture pivot
│   └── Google runtime removed
│
├── implementation.md
│   └── v3.0 created
│
├── prompt_1b.md
│   └── resume + migrate + gate Phase 0–4
│
└── Next
    ├── create MapTiler key
    ├── create Geoapify key
    ├── replace implementation.md
    ├── run Prompt 1B after quota reset
    ├── verify Phase 0–4 all PASS
    └── then write/run Prompt 2
```

---

# 37. FINAL HANDOFF STATUS

**Current milestone:**

```text
PROMPT 1B PREPARATION
```

**Completed external setup:**

```text
Supabase ✅
Google Cloud project created but no longer needed for Maps runtime ✅/unused
```

**Still required before ideal Prompt 1B live verification:**

```text
MapTiler account + key ⬜
Geoapify account + key ⬜
```

**Next coding action:**

```text
Run prompt_1b.md in same Codex session after quota reset.
```

**Gate after that:**

```text
Phase 0–4 all DONE/PASS
```

**Then:**

```text
Prompt 2
```

---

# 38. END OF HANDOFF

Future sessions should continue from this point.

Do not revert to Google Maps Platform runtime architecture unless the user explicitly changes the product/cost decision.

**Current official architecture:**

```text
Supabase
+ MapLibre
+ MapTiler
+ Geoapify
+ Moveek/ShowtimeProvider
+ Google Maps external review shortcut
```

---

# 39. CURRENT SNAPSHOT — SAU PROMPT 1B (2026-09-20)

Phần này là **trạng thái hiện tại mới nhất** và supersede các phần cũ về trạng thái Prompt 1B / roadmap / exact next steps nếu có mâu thuẫn.

## 39.1. Prompt 1B đã thực sự chạy

Sau khi quota hồi, user đã chạy prompt resume/migration cho Prompt 1B trong Codex.

Lịch sử model trong Codex ở lượt này:

```text
Bắt đầu: GPT-6 Astra
Sau đó session có lúc chuyển sang: GPT-5.6 Sol High
```

Codex đã tiếp tục từ repo hiện có, không restart project.

## 39.2. Kết quả Prompt 1B

Completion Report cuối cùng:

```text
Overall: PARTIAL
```

Lý do PARTIAL **không phải lỗi implementation**. Phần code/migration chính đã hoàn thành; còn thiếu hai credential/provider live checks.

Current phase status:

```text
PHASE 0 — DONE
PHASE 1 — DONE
PHASE 2 — DONE
PHASE 3 MapLibre/MapTiler implementation — DONE
PHASE 3 real MapTiler live verification — BLOCKED_EXTERNAL
PHASE 4 Geoapify implementation — DONE
PHASE 4 real Geoapify live verification — BLOCKED_EXTERNAL
PHASE 5+ — TODO / NOT STARTED
```

Không được bắt đầu Phase 5 cho tới khi hai provider live checks còn lại PASS.

---

# 40. NHỮNG GÌ PROMPT 1B ĐÃ HOÀN THÀNH

## 40.1. Google runtime architecture đã bị loại bỏ

Codex report cho biết:

```text
Google Maps JS: REMOVED
Google Places: REMOVED
Google Routes: NOT PRESENT
Google API key requirement: REMOVED
Map ID requirement: REMOVED
Runtime/package/build audit: 0 prohibited findings
```

Google Maps chỉ còn được giữ dưới dạng external URL search/review/directions theo architecture v3.

## 40.2. MapLibre migration

Đã migrate map runtime sang MapLibre GL JS.

Các phần quan trọng đã làm:

- MapLibre map lifecycle;
- custom markers;
- attribution;
- opt-in geolocation;
- route-layer skeleton;
- missing/error states;
- Vite Web Worker configuration cho MapLibre v6;
- desktop/mobile browser rendering với mock style.

Một bug thực tế đã được phát hiện trong browser test:

```text
MapLibre v6 cần cấu hình Web Worker path riêng khi dùng Vite
```

Codex đã sửa bằng worker emit/config phù hợp.

## 40.3. Geoapify migration

Đã migrate Places flow sang:

```text
React frontend
→ Supabase Edge Function /geo
→ Geoapify
```

Đã có:

- provider abstraction;
- autocomplete/search/browse/details/reverse support;
- normalized DTO;
- durable place CRUD;
- private/custom places;
- attribution;
- external Google Maps review URL;
- Edge auth/error handling;
- database quota logic.

Route planner/Route Matrix product logic vẫn chưa được start vì thuộc Prompt 2 / Phase 7.

## 40.4. Database forward migrations

Prompt 1B giữ nguyên historical migrations và thêm forward migrations cho v3.

Current remote state theo `PROGRESS.md` sau Prompt 1B:

```text
9 migrations live
7 public tables with RLS
geo Edge Function ACTIVE
```

Migration strategy đã làm:

- provider-neutral saved place schema;
- không destructive reset database;
- không sửa sâu migration cũ đã apply;
- legacy Google rows thiếu coordinates được giữ lại và đánh dấu `needs_location` thay vì bịa tọa độ;
- atomic per-user Geo quota;
- schema compatibility cho transport/tours/stops/share/profile.

---

# 41. VERIFICATION MỚI NHẤT

Theo `PROGRESS.md` mới sau Prompt 1B:

```text
Local v3 final gate:
- lint: PASS
- browser TypeScript: PASS
- Deno Edge typecheck: PASS
- frontend tests: 82/82 PASS
- security tests: 46/46 PASS
  - 23 PostgreSQL
  - 23 Edge/security
- production build: PASS

Browser final gate:
- Playwright desktop/mobile: 10/10 PASS

Security/dependency:
- npm audit --omit=dev: 0 vulnerabilities
- credential/runtime audit: 0 findings
- legacy Google runtime audit: 0 findings
```

Supabase live verification:

```text
Project: ACTIVE_HEALTHY
Region: ap-southeast-1 / Singapore
9 migrations present
7 public tables have RLS
geo Edge Function ACTIVE
email confirmation enabled
TOTP enabled
```

Live two-user security audit đã PASS:

- password login;
- TOTP enrollment/challenge;
- AAL2;
- AAL1 denied/empty access;
- owner CRUD;
- cross-owner isolation;
- anonymous denial;
- forged JWT/AAL1 rejection;
- unknown Edge action rejection;
- missing-provider 503 behavior;
- quota RPC;
- private snapshot redaction sau source deletion;
- share revocation.

Temporary test users/fixtures đã được xóa sau verification.

---

# 42. BLOCKERS HIỆN TẠI — CHỈ CÒN 2 PROVIDER LIVE CHECKS

## 42.1. MapTiler

Current status:

```text
VITE_MAPTILER_API_KEY: chưa có
MapTiler live verification: BLOCKED_EXTERNAL
```

Cần:

1. Create MapTiler Free account.
2. Create browser/project key:

```text
SmartFoodRoute-Web
```

3. Restrict Allowed HTTP Origins ít nhất:

```text
http://localhost:5173
```

4. Store local dev key trong ignored environment file, ví dụ:

```env
VITE_MAPTILER_API_KEY=...
```

5. Không gửi key vào ChatGPT.
6. Sau này khi có production domain, thêm domain đó vào Allowed Origins.

Live acceptance cần chứng minh:

- real MapTiler style loads;
- real tiles render;
- attribution visible;
- desktop works;
- mobile works;
- no Google runtime dependency;
- missing/error fallback vẫn đúng.

## 42.2. Geoapify

Current status:

```text
GEOAPIFY_API_KEY Edge secret: chưa có
Geoapify live verification: BLOCKED_EXTERNAL
```

Cần:

1. Create Geoapify Free account/project:

```text
SmartFoodRoute
```

2. Generate API key.
3. Set ONLY as Supabase Edge Function secret:

```text
GEOAPIFY_API_KEY
```

4. Không dùng:

```text
VITE_GEOAPIFY_API_KEY
```

5. Không gửi key vào ChatGPT.

Live acceptance chỉ cần vài request thật tại Việt Nam để tiết kiệm quota:

- AAL2 authenticated `/geo` request;
- autocomplete;
- category Places;
- place details nếu current flow hỗ trợ;
- reverse geocoding;
- normalized DTO;
- AAL1/unauthenticated rejection vẫn đúng;
- no frontend direct Geoapify request;
- no secret logging.

---

# 43. CÁC ITEM KHÔNG CẢN PROMPT 2

Current `PROGRESS.md` còn nhắc:

```text
Production origin unknown
Real email confirmation/reset delivery
Physical Authenticator scan/code UX
```

Cách hiểu hiện tại:

- **Production origin** là việc deploy sau này; không cần block development gate Phase 0–4 nếu localhost live provider checks đã PASS.
- **Email delivery / physical Authenticator UX** có thể giữ `MANUAL_VERIFICATION_REQUIRED` vì Auth/TOTP/AAL2 logic đã có live security evidence mạnh.
- Không fake PASS cho các manual UX item này, nhưng chúng không nên chặn Prompt 2 nếu Prompt 1B provider gate đã PASS.

---

# 44. SECURITY NOTE — `pass-key/`

Trong Prompt 1B, Codex từng phát hiện Supabase credentials ở file plaintext dưới:

```text
pass-key/
```

Current repo đã cấu hình ignore cho `pass-key/`, environment files và test/build output.

Future assistant/Codex phải:

- không commit `pass-key/`;
- không đọc/echo secret values vào Completion Report;
- không yêu cầu user gửi file đó vào chat;
- ưu tiên secret/env mechanism;
- sau khi không còn cần, nên loại bỏ plaintext credentials khỏi workspace hoặc lưu bằng cơ chế secret an toàn hơn.

---

# 45. EXACT NEXT STEPS — CURRENT

Thứ tự tiếp theo hiện tại:

```text
1. Tạo MapTiler account + key
2. Restrict MapTiler origin: http://localhost:5173
3. Set VITE_MAPTILER_API_KEY local
4. Tạo Geoapify account/project + API key
5. Set GEOAPIFY_API_KEY as Supabase Edge secret
6. Mở đúng Codex session/repo hiện tại
7. Chạy ONLY provider live-verification closeout prompt
8. Update PROGRESS.md
9. Nếu MapTiler live PASS + Geoapify live PASS + regression PASS
   → Prompt 1B gate = PASS
   → READY FOR PROMPT 2
10. Sau đó mới viết/chạy Prompt 2 (Phase 5–8)
```

Không chạy lại Prompt 1.

Không chạy lại toàn bộ Prompt 1B dài.

Không start Phase 5 trước khi gate đóng.

---

# 46. CODEX CLOSEOUT PROMPT — DÙNG SAU KHI ĐÃ CÓ 2 KEY

Paste prompt sau vào **đúng Codex session/repo hiện tại** sau khi MapTiler key và Geoapify Edge secret đã được cấu hình:

```text
Continue from the current SmartFoodRoute repository state and PROGRESS.md.

DO NOT redo Prompt 1B.
DO NOT modify completed Phase 0–2 implementation unnecessarily.
DO NOT start Phase 5.

The only remaining Prompt 1B acceptance work is live provider verification for MapTiler and Geoapify.

Before doing anything:
1. Read current implementation.md v3.0.
2. Read current PROGRESS.md.
3. Inspect the current repository and existing test scripts.
4. Preserve all completed migrations, tests, Supabase deployment and v3 migration work.

The following external configuration should now be available in the environment:
- VITE_MAPTILER_API_KEY
- GEOAPIFY_API_KEY as a Supabase Edge Function secret

Never print or expose either secret.

TASK A — MAPTILER LIVE VERIFICATION

Verify the real MapTiler integration, not a mock.

Required evidence:
- VITE_MAPTILER_API_KEY is detected without printing its value.
- MapLibre loads a real MapTiler style.
- Real tiles/style render successfully.
- Attribution is visible.
- Desktop rendering works.
- Mobile rendering works.
- No Google Maps runtime dependency is used.
- Missing/error behavior remains correct.
- localhost origin restriction works as expected.

If a test must temporarily use localhost:
http://localhost:5173

Do not claim PASS from the existing mocked MapLibre test.
This must be a real MapTiler provider verification.

TASK B — GEOAPIFY LIVE VERIFICATION

Verify Geoapify only through the deployed Supabase /geo Edge Function.

Do NOT expose GEOAPIFY_API_KEY to the frontend.

Use only a small number of live Vietnam requests to conserve quota.

Verify:
1. authenticated AAL2 call succeeds;
2. autocomplete returns a real result;
3. Places/category search returns a real result;
4. place details works if supported by the existing Phase 4 flow;
5. reverse geocoding returns a real result;
6. responses are normalized into our application DTOs;
7. unauthenticated/AAL1 requests remain rejected;
8. provider errors remain handled correctly;
9. no raw secret is logged;
10. no direct frontend Geoapify call exists.

Do not begin routeMatrix/route planner implementation.
Phase 7 is still out of scope.

TASK C — REGRESSION CHECK

After live provider verification, run the relevant final checks:
- lint
- browser + Edge typecheck
- unit/component/integration tests
- SQL/RLS/security tests
- Playwright where appropriate
- production build
- credential/secret audit
- legacy Google runtime audit

Do not weaken or skip existing tests merely to obtain PASS.

TASK D — UPDATE PROGRESS.md

If both real providers pass, update:

Phase 3 real MapTiler verification:
BLOCKED_EXTERNAL -> DONE

Phase 4 real Geoapify verification:
BLOCKED_EXTERNAL -> DONE

Record exact verification evidence and date.

Production domain is NOT required for this development gate; retain it as a future deployment item rather than a blocker to Phase 0–4 completion.

Physical Authenticator UX and real email delivery may remain:
MANUAL_VERIFICATION_REQUIRED

if no new manual user action was performed.

Do not falsely mark them verified.

FINAL DECISION

If and only if:
- Phase 0 DONE
- Phase 1 DONE
- Phase 2 DONE
- Phase 3 implementation + REAL MapTiler verification DONE
- Phase 4 implementation + REAL Geoapify verification DONE
- final regression/security/build gate passes

then set the Prompt 1B gate to PASS and state:

READY FOR PROMPT 2

Otherwise state exactly which acceptance item remains blocked.

STOP immediately after the Prompt 1B gate.
DO NOT implement Phase 5.
```

---

# 47. MODEL / REASONING GUIDANCE — CURRENT

Historical:

```text
Prompt 1: GPT-6 Astra High
Prompt 1B: started with GPT-6 Astra; session later used GPT-5.6 Sol High
```

Current recommendation:

## Provider live-verification closeout

Preferred:

```text
GPT-5.6 Sol
Reasoning: High
```

Alternative nếu còn quota Astra:

```text
GPT-6 Astra
Reasoning: Medium
```

Không cần Astra High chỉ để đóng hai provider blockers.

## Prompt 2 (Phase 5–8)

Nên ưu tiên:

```text
GPT-6 Astra
Reasoning: High
```

vì Prompt 2 chứa core intelligence khó hơn:

- planner state;
- cinema fixed anchor;
- Geoapify Route Matrix;
- Haversine prefilter;
- backward scheduling;
- forward validation;
- opening-hours constraints;
- Top 3 route ranking;
- final route geometry;
- timeline;
- budget.

Nếu cần tiết kiệm quota:

```text
GPT-6 Astra Medium
```

hoặc:

```text
GPT-5.6 Sol High
```

---

# 48. CURRENT ROADMAP — NEW AUTHORITATIVE STATUS

```text
PHASE 0 — Foundation
DONE

PHASE 1 — Supabase Schema + Security
DONE
9 live migrations
23 PostgreSQL tests + live two-user audit PASS

PHASE 2 — Auth + MFA
DONE
Live password + generated TOTP/AAL2 verification PASS
Physical authenticator UX may remain manual

PHASE 3 — MapLibre + MapTiler
Implementation DONE
Real MapTiler provider live verification BLOCKED_EXTERNAL

PHASE 4 — Geoapify Places
Implementation DONE
Real Geoapify provider live verification BLOCKED_EXTERNAL

PHASE 5 — Planner UI
TODO

PHASE 6 — Cinema/Showtime
TODO

PHASE 7 — Route Matrix + Scheduler
TODO

PHASE 8 — Final Route + Timeline + Budget
TODO

PHASE 9+ — Sharing/Product Completion/Production
TODO
```

---

# 49. WHAT THE NEXT CHATGPT SESSION SHOULD DO

Nếu user chỉ upload file này, assistant phải bắt đầu bằng cách đọc `CURRENT SNAPSHOT` và xác định ngay:

```text
Current milestone:
PROMPT 1B CLOSEOUT — LIVE PROVIDER VERIFICATION
```

Sau đó:

1. Hỏi user MapTiler key đã tạo chưa — **không hỏi giá trị key**.
2. Hỏi user Geoapify key/Edge secret đã cấu hình chưa — **không hỏi giá trị key**.
3. Nếu chưa: hướng dẫn từng bước setup.
4. Nếu rồi: đưa `CODEX CLOSEOUT PROMPT` ở section 46.
5. Sau khi Codex chạy xong: yêu cầu user gửi `PROGRESS.md` mới nhất hoặc Completion Report.
6. Audit gate Phase 0–4.
7. Chỉ khi gate PASS mới tạo Prompt 2.
8. Không đề xuất quay lại Google Maps Platform runtime.
9. Không để production-domain item chặn Prompt 2 nếu localhost live provider checks đã PASS.
10. Không fake manual verification cho email/physical Authenticator.

---

# 50. SESSION SUMMARY IN ONE SCREEN — UPDATED

```text
SmartFoodRoute
│
├── Architecture v3
│   ├── Supabase
│   ├── MapLibre GL JS
│   ├── MapTiler
│   ├── Geoapify via Supabase Edge /geo
│   ├── Moveek/ShowtimeProvider later
│   └── Google Maps external URL only
│
├── Prompt 1
│   ├── Phase 0–2 largely completed
│   ├── Google Phase 3–4 legacy implementation
│   └── quota exhausted
│
├── Prompt 1B
│   ├── Google runtime removed ✅
│   ├── MapLibre migration ✅
│   ├── Geoapify provider/Edge migration ✅
│   ├── provider-neutral schema ✅
│   ├── 9 migrations live ✅
│   ├── Supabase live/security ✅
│   ├── 82 frontend tests ✅
│   ├── 46 security tests ✅
│   ├── Playwright 10/10 ✅
│   ├── build ✅
│   ├── npm audit 0 ✅
│   ├── MapTiler LIVE ⬜ BLOCKED_EXTERNAL
│   └── Geoapify LIVE ⬜ BLOCKED_EXTERNAL
│
├── Current next action
│   ├── create/configure MapTiler key
│   ├── create/configure Geoapify Edge secret
│   ├── run provider live-verification closeout
│   └── update PROGRESS.md
│
└── Gate
    ├── if both provider live checks PASS
    │   └── READY FOR PROMPT 2
    └── then Prompt 2 = Phase 5–8
```

---

# 51. FINAL HANDOFF STATUS — CURRENT

**Current milestone:**

```text
PROMPT 1B CLOSEOUT
```

**Completed:**

```text
Supabase setup ✅
Prompt 1B implementation/migration ✅
Google runtime removal ✅
MapLibre implementation ✅
Geoapify provider/Edge implementation ✅
Database forward migrations ✅
Auth/MFA/RLS live security verification ✅
Local/browser/security/build gates ✅
```

**Still required before Prompt 2:**

```text
MapTiler account/key + real live verification ⬜
Geoapify account/key + Edge secret + real live verification ⬜
```

**Not blockers to development Prompt 2 once provider gate passes:**

```text
production domain configuration
real email delivery UX
physical Authenticator scan UX
```

These should remain deployment/manual-verification work and must not be falsely marked DONE.

**Next coding action:**

```text
Run section 46 provider live-verification closeout prompt after configuring both keys.
```

**Then:**

```text
If Phase 0–4 gate PASS
→ generate/run Prompt 2
→ Phase 5–8
```

---

# 52. END OF UPDATED HANDOFF

Future ChatGPT sessions should treat sections **39–51** as the newest current state.

Do not revert to older Google Maps Platform runtime architecture.

Do not restart the repository.

Do not run Prompt 1/Prompt 1B from the beginning.

Do not start Phase 5 until the two remaining live provider checks are closed.

**Current official architecture remains:**

```text
Supabase
+ MapLibre GL JS
+ MapTiler
+ Geoapify via Supabase Edge Function
+ Moveek/ShowtimeProvider later
+ Google Maps external review/search shortcut only
```


---

# 53. PROMPT 1B CLOSEOUT — VERIFIED 2026-09-20

Phần này supersede sections 39–52 về current state nếu có mâu thuẫn.

PROMPT 1B GATE = PASS.
READY FOR PROMPT 2.

Live MapTiler: real streets-v4 style và tiles PASS trên desktop + Pixel 7; attribution hiển thị; 28 provider responses mỗi viewport, không non-2xx; không page error hoặc Google runtime request; origin không nằm trong allowlist bị từ chối HTTP 403.

Live Geoapify qua deployed Supabase /geo: kiểm tra access control PASS; AAL2 autocomplete, category Places, place details và reverse geocoding PASS; normalized DTO đã được kiểm tra.

Final regression: npm run check PASS với 82/82 frontend tests, 46/46 security tests và production build; Playwright 10/10 PASS; npm audit --omit=dev báo 0 vulnerabilities; Supabase ACTIVE_HEALTHY; temporary live Auth users/fixtures đã cleanup.

Manual/deployment items vẫn chưa được đánh dấu verified: production-domain origin configuration, real email confirmation/reset delivery và một physical Authenticator scan/code. Các item này không còn là Prompt 1B blocker.

# 54. CURRENT ROADMAP — AUTHORITATIVE AFTER CLOSEOUT

Phase 0 Foundation: DONE.
Phase 1 Schema/Security: DONE.
Phase 2 Auth/MFA: DONE.
Phase 3 MapLibre/MapTiler: DONE, gồm real provider acceptance.
Phase 4 Geoapify Places: DONE, gồm real provider acceptance.
Prompt 1B: PASS.
Phase 5–8 / Prompt 2: TODO.
Phase 9+: TODO.

Next action: READY FOR PROMPT 2. Phase 5+ không được bắt đầu trong closeout này.

---

# 55. PROMPT 2 CLOSEOUT — VERIFIED 2026-09-20

Phần này supersede sections 39–54 về current state nếu có mâu thuẫn.

PROMPT 2 GATE = PASS.
PHASE 0–8 = DONE.
NEXT EXPLICIT PRODUCT PHASE = PHASE 9 SHARING UI.

Prompt 2 implementation:
- Phase 5 Planner UI: start, candidates, transport, party/time/preferences, planner state.
- Phase 6 Cinema/Showtime: ShowtimeProvider abstraction, manual showtime fallback, fixed anchor, booking handoff and freshness warning.
- Phase 7 Scheduler: Haversine prefilter, deployed Geoapify Route Matrix, backward schedule, forward validation, opening-hours handling and Top 3 ranking.
- Phase 8 Final output: deployed Geoapify final Routing, MapLibre route source/layer, timeline, budget and warnings.
Security/provider boundary remains unchanged:
- Geoapify secret stays in Supabase Edge only.
- `/geo` requires real Auth + verified TOTP/AAL2 and quota.
- anonymous, forged JWT and AAL1 requests remain rejected.
- Haversine is an explicitly unverified fallback, never presented as provider route data.
- no Google Maps Platform runtime dependency was reintroduced.
- no Moveek scraping/anti-bot bypass was added.

Final local/browser gate:
- `npm run check` PASS: 93/93 frontend tests, 49/49 security tests, build and runtime/secret audit PASS.
- Playwright 12/12 PASS on desktop/mobile.
- `npm audit --omit=dev`: 0 vulnerabilities.
- existing Vite >500 kB chunk warning remains non-blocking and was not hidden.
Live deployed gate:
- Supabase project remained ACTIVE_HEALTHY with the same nine migrations.
- `geo` was redeployed ACTIVE with Places + Route Matrix + Routing support.
- `npm run live:security` PASS including real Geoapify Route Matrix and final Routing through Edge.
- `npm run live:planner` PASS with a real temporary Auth/TOTP user and seeded places.
- Browser observed Route Matrix + Routing Edge responses HTTP 200.
- UI showed `Matrix: Geoapify` and `Route: Geoapify verified`.
- MapLibre canvas changed after the verified route was applied.
- no browser page errors.
- temporary users and cascade-owned data were cleaned.

Manual/deployment items still unverified:
- production origin restrictions,
- real email confirmation/reset delivery,
- one physical Authenticator scan/code.

`implementation.md` remained unchanged with SHA-256:
`E0B2AE4102B01603A3566AA3B106C04FB8DB9413DFB02ED5B638D24553D16AF9`
# 56. CURRENT ROADMAP — AUTHORITATIVE AFTER PROMPT 2

Phase 0 Foundation: DONE.
Phase 1 Schema/Security: DONE.
Phase 2 Auth/MFA: DONE.
Phase 3 MapLibre/MapTiler: DONE.
Phase 4 Geoapify Places: DONE.
Phase 5 Planner UI: DONE.
Phase 6 Cinema/Showtime: DONE with safe manual fallback; Moveek adapter only if a permitted source is available.
Phase 7 Route Matrix/Scheduler: DONE.
Phase 8 Final Route/Timeline/Budget: DONE.
Phase 9 Sharing UI: TODO — next explicit product phase.
Phase 10 External handoffs: TODO.
Phase 11 PWA/Lucky Wheel/Polish: TODO.
Phase 12 Production audit/release: TODO.

Resume commands:
- `npm run check`
- `npm run test:e2e`
- `npm run live:security`
- `npm run live:planner`
- `node scripts/live-maptiler.mjs`

Do not restart Prompt 1/1B/2. Read `PROGRESS.md` first; if it conflicts with this handoff, the newer canonical progress/evidence wins.


---

# 57. PHASE 9 SHARING UI CLOSEOUT — VERIFIED 2026-09-20

Phần này supersede sections 39–56 về current state nếu có mâu thuẫn.

PHASE 9 SHARING UI = DONE.
PHASE 0–9 = DONE.
NEXT EXPLICIT PRODUCT PHASE = PHASE 10 EXTERNAL HANDOFFS.

Implemented:
- Forward-only migration `202609200004_phase9_sharing.sql`; no historical migration rewritten.
- Transactional AAL2 `save_tour_snapshot(...)` RPC saves `saved_tours` + ordered `tour_stops` atomically.
- Planner persists the private start point at position 0 plus the selected candidate stops as historical snapshots.
- Public `get_shared_tour(token)` Safe DTO now includes `id`, `totalDurationMinutes` and `totalBudget` while preserving server-side redaction.
- Owner UI supports save, token creation/rotation, QR, copy and revoke.
- `/share/:token` is intentionally outside Auth/MFA guards and only consumes `get_shared_tour`; it never enumerates private tables.
- Share token expiry remains 7 days through the existing secure token RPC.

Privacy/security:
- start_point is always redacted in public output;
- linked private saved places remain redacted;
- deletion of a private source place cannot expose its historical snapshot;
- anonymous direct table reads remain denied;
- token rotation invalidates old links and revoke invalidates the current link;
- malformed UUID tokens are rejected client-side before RPC.


Verification:
- `npm run check` PASS: lint, browser + Deno Edge typecheck, 94/94 frontend tests, 51/51 security tests, production build, runtime/secret audit 0 findings.
- Playwright 14/14 PASS on desktop/mobile, including Planner save → share → QR → anonymous public page.
- Local PostgreSQL migration tests verify atomic rollback on cross-owner stop references and private Safe DTO redaction.
- Supabase migration history: local = remote = 10 migrations through `202609200004`.
- `npm run live:security` PASS on the real linked Supabase project, including atomic Phase 9 snapshot RPC, Safe DTO totals, redaction after source deletion, anonymous direct-table denial and revocation.
- `npm run live:planner` PASS using a real temporary Auth/TOTP user, real Planner/Geoapify path, real save/share token, QR/public URL in a fresh unauthenticated browser context, private-start hiding, public-stop retention, revoke invalidation and cleanup.
- Existing non-blocking Vite >500 kB chunk warning remains and was not hidden.

Manual/deployment items still unverified:
- production origin restrictions,
- real email confirmation/reset delivery,
- one physical Authenticator scan/code.

No Git metadata exists; no Git state was modified.

# 58. CURRENT ROADMAP — AUTHORITATIVE AFTER PHASE 9

Phase 0 Foundation: DONE.
Phase 1 Schema/Security: DONE.
Phase 2 Auth/MFA: DONE.
Phase 3 MapLibre/MapTiler: DONE.
Phase 4 Geoapify Places: DONE.
Phase 5 Planner UI: DONE.
Phase 6 Cinema/Showtime: DONE with safe manual fallback.
Phase 7 Route Matrix/Scheduler: DONE.
Phase 8 Final Route/Timeline/Budget: DONE.
Phase 9 Sharing UI: DONE.
Phase 10 External Handoffs: TODO — next explicit product phase.
Phase 11 PWA/Lucky Wheel/Polish: TODO.
Phase 12 Production Audit/Release: TODO.

Resume commands:
- `npm run check`
- `npm run test:e2e`
- `npm run live:security`
- `npm run live:planner`
- `node scripts/live-maptiler.mjs`

Do not restart Prompt 1/1B/2 or Phase 9. Read `PROGRESS.md` first; if it conflicts with this handoff, the newer canonical progress/evidence wins.
