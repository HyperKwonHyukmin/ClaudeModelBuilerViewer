# Module Unit Studio 0.0.151 — 가서포트 단면 선택 + 가서포트 CSV 내보내기

사용자 요청(2026-09-17): ① 가서포트가 L100×100×10t 로만 고정돼 있는데 3종 중에서 고르게 하고
그 정보가 부재 property 에도 반영되게 할 것, ② 생성된 가서포트를 CSV 로 뽑는 버튼을
Edit › 가서포트 에 만들 것(기준 코드 `HiTessCloud_Flask/main/PythonModule/BdfToCsv.py`,
기준 출력 `ModuleUnit/BDFtoCSV/3370_M04_csv.csv`).

## 1. 단면 선택 (L 앵글 3종)

`data/supportSections.js` 가 단일 출처다. Edit › 가서포트 상단 버튼 3개로 고른다.

| id | 라벨 | CSV `size` | PBEAML L dims |
|----|------|-----------|---------------|
| `ANG_100x100x10` (기본) | L100×100×10t | `ANG_100x100x10` | 100 / 100 / 10 / 10 |
| `ANG_100x100x13` | L100×100×13t | `ANG_100x100x13` | 100 / 100 / 13 / 13 |
| `ANG_130x130x12` | L130×130×12t | `ANG_130x130x12` | 130 / 130 / 12 / 12 |

- **왜 3종 고정인가** — 사내 구조 CSV(`size` 열)에 실제로 등장하는 규격이고, CSV 로 되돌렸을 때
  ModelBuilder 의 `ANG_<w>x<h>x<t>` 파서를 통과해야 한다. 임의 치수를 열면 그 왕복이 깨진다.
- **dims 규약** — `FeModelBuilder.NormalizeDims` 가 L 은 3개 dims 를 `[d0,d1,d2,d2]` 로 늘린다.
  즉 PBEAML L = [수평다리, 수직다리, tw, tf] 이고 두 두께가 같다. 실측 확인: 사내 `3370_M04.bdf`
  에 100/100/10/10 · 100/100/13/13 · 130/130/12/12 PBEAML 이 모두 존재한다.
- **단면은 설치 시점 값이 intent 에 박힌다**(`params.sectionId` + `params.dims`). 도중에 바꿔도
  이미 설치한 부재는 그대로라 한 모델에 규격을 섞을 수 있다 — 소급 변경하면 사용자가 의도한
  혼용(일부만 두껍게)이 사라진다.
- **구(舊) intent 호환** — 0.0.150 이전 편집 의도 JSON 에는 `sectionId` 가 없다.
  `resolveSupportSection()` 이 id → dims → 기본값 순으로 찾아 100×100×10t 로 해석한다.

### 모델 반영

- `applyEditedModel` 이 **규격별로 PBEAML 을 1장만** 만들고 같은 규격은 PID 를 공유한다.
  (예전엔 가서포트마다 1장 → 같은 규격이 수십 장 중복돼 BDF 가 커지고 보고서 부재 표가 쪼개졌다.)
- ⚠ `three/SupportBeamPreview.buildSupportBeam3D` 는 **치수별 InstancedMesh** 를 만들어 Group 으로
  돌려준다(반환형이 InstancedMesh → Group 으로 바뀜). InstancedMesh 는 geometry 가 하나뿐이라
  예전처럼 첫 부재 dims 로 전부 그리면 굵기가 다른 앵글이 같은 굵기로 보인다.
- ⚠ **그 Group 에 중심선(`buildSupportBeamPreview`)을 함께 넣는다** — 솔리드만 넣으면 100mm 앵글이
  주위 부재에 가려져 "3D 단면으로 바꾸면 가서포트가 사라진다" 가 된다(0.0.152 사용자 신고).
  선은 `depthTest:false`·`renderOrder 999` 라 항상 위에 뜬다. **투명도를 낮추지 말 것** — 0.5 로
  흐리게 하면 어두운 배경과 섞여(실측 g≈119) 다시 안 보인다. 솔리드 자체를 `depthTest:false` 로
  만드는 것도 안 된다(면 정렬이 깨져 뒷면이 앞면을 덮는다).

## 2. 가서포트 CSV 내보내기

Edit › 가서포트 아코디언 하단 "가서포트 CSV 내보내기 (n행)". 가서포트가 1개 이상일 때만 뜬다.

- 산출: `<원본파일명>_support.csv`. 저장은 `useEditStore.exportSupportCsv()` → `saveTextFile()`.
  편집 의도 JSON 내보내기와 같은 함수를 쓰되 **`askLocation: true`** 로 부른다.
- ⚠ **CSV 는 반드시 저장 위치를 묻는다**(0.0.152 사용자 신고 — 모델 폴더에 조용히 떨어져 어디
  생겼는지 알 수 없었다). 사용자가 CAD 로 가져가는 산출물이라, 해석 파이프라인이 다시 읽어 가는
  중간 산출물(편집 의도 JSON = 폴더 직접 쓰기)과 정책이 다르다.
  - 경로: `showSaveFilePicker` → 없으면 `<a download>` blob. **Electron 뷰어는 `file://` 이라
    showSaveFilePicker 가 막힐 수 있는데, blob 다운로드가 `will-download` 를 발화시켜 OS 저장
    대화상자를 띄운다**(실측 확인 — WorkBench `electron/index.js` 의 `installCleanSaveDialogTitle`
    이 제목 "파일 저장" + 기본 파일명을 지정해 둔다). 어느 경로든 사용자가 위치를 고른다.
  - ⚠ 저장 대화상자는 **사용자 제스처**가 살아 있어야 뜬다. `exportSupportCsv` 안에서
    `saveTextFile` 앞에 `await` 를 넣지 말 것(CSV 조립은 동기).
- **BDF 를 거치지 않는다.** 기준 `BdfToCsv.py` 는 BDF 를 읽어 PID 1000 CBEAM 을 골라내지만,
  스튜디오는 같은 정보를 intent 로 이미 들고 있어 왕복이 필요 없다 — 구조 해석 전에도 뽑힌다.
- 열 구성은 ModelBuilder `Cmb.Io.Csv.StructureCsv` 와 1:1:
  `name,type,pos,poss,pose,size,stru,ori,division,weld` · CRLF · 마지막 줄 개행(pandas 동일).
- ⚠ `name`(` =30137/384565`)과 `stru`(`0.0308360511306552`)는 BdfToCsv.py 가 예시 CAD 참조를
  박아 둔 값이라 **그대로 상수로 쓴다**(기준 출력과 서식 일치). 엔진은 `stru` 를 읽지 않고
  (`StructureCsv.ParentStru` 상수만 존재) `name` 은 라벨로만 쓴다.
- ⚠ `ori` 는 "축에 수직인 벡터" 가 아니라 국부축 **기준 벡터**다(엔진·Nastran 이 직교화한다).
  그래서 사내 CAD CSV 처럼 축 단위벡터를 쓰되, **수직 부재(|dz|>0.9)에서는 [1,0,0]** 으로 갈아탄다 —
  `0 0 1` 고정이면 축과 평행해 퇴화한다. 기준(직교화 전 벡터)이 `applyEditedModel.
  computeSupportOrientation` 과 같아 CSV 와 BDF 가 같은 국부 좌표계를 가리킨다.
- 노드가 삭제된 가서포트는 건너뛰고 건수만 보고한다(`skipped`).

## 실측 검증

`npx vitest run` — **43 files / 723 tests** (신규 13 + 갱신 2).
Playwright(dev 5210, 실측 모델 `3496-35210-A508372_20260108_edit.json`):

| 확인 | 결과 |
|------|------|
| 단면 버튼 | `100×100×10t / 100×100×13t / 130×130×12t` |
| 3종 혼용 설치 | dims 100/100/10/10 · 130/130/12/12 · 100/100/13/13 각각 intent 에 기록 |
| 편집 의도 문구 | `가서포트 L130×130×12t (N3↔N4)` |
| 편집 반영 모델 | 신규 PBEAML 3장(규격 3종), 부재별 PID 가 규격과 일치 |
| CSV | `..._edit_support.csv` 3행, size 열이 규격별로 다름, ori `   0.000   0.000   1.000` |
| 콘솔/페이지 오류 | 0건 |

0.0.153 재검증 — 캔버스 스크린샷의 청록(#2DD4BF) 픽셀 수를 세어 가시성을 정량 확인:

| 확인 | 결과 |
|------|------|
| 모델 숨김 · 가서포트(640mm) 설치 | 선 모드 +35px · **3D 단면 +175px**(솔리드+중심선) |
| 모델 표시 · 카메라 고정 · 3D 단면 | 가서포트 있음 5,097 / 없음 5,072 → **+25px 로 모델을 뚫고 보임** |
| CSV 저장 | 다운로드(=저장 대화상자) 이벤트 발생, **폴더 무단 저장 0회**, CRLF 유지 |

CSV 실측 1행:
```
 =30137/384565,SCTN,X 110720mm Y -4705mm Z 30451mm,X 110720mm Y -4705mm Z 30451mm,X 110720mm Y -6975mm Z 30451mm,ANG_100x100x10,0.0308360511306552,   0.000   0.000   1.000,SUPP,
```

## 가서포트 PBEAML 의 PID = 기존 최대값+1 (2026-09-17 결정, 바꾸지 말 것)

레거시 `BdfToCsv.py` 는 가서포트를 **PID 1000** 이라는 매직넘버로 식별한다. 스튜디오도 그 대역을
예약할지 검토했으나 **기존 최대값+1 을 유지**하기로 했다(사용자 결정).

- 고정 PID 1000 은 **기존 모델이 이미 쓰고 있으면 충돌**한다 — 실제로 `3370_M04.bdf` 의 1000 번은
  그 모델 자신의 가서포트 PBEAML 이다. 새 모델에 그대로 박으면 남의 단면을 덮어쓴다.
- 단면이 3종이 되면서 가서포트 PBEAML 이 **규격당 1장씩 최대 3장**이다. 단일 매직넘버로는 애초에
  다 담지 못한다.
- 가서포트 식별은 PID 가 아니라 요소의 `remark: '가서포트'` 로 한다. CSV 도 BDF 가 아니라
  intent 에서 직접 만들므로 PID 규약에 기대지 않는다.
- ⚠ 따라서 **스튜디오가 낸 BDF 를 레거시 `BdfToCsv.py` 에 넣으면 가서포트를 찾지 못한다.**
  그 경로는 쓰지 말고 스튜디오의 "가서포트 CSV 내보내기" 를 쓸 것.

## 버전

- 0.0.151 — 단면 3종 + CSV 내보내기 (이전 릴리스 0.0.150 = ModelBuilder 셸 정렬 + 독립 그룹 자동 연결)
- 0.0.153 — 3D 단면에서 가서포트가 가려지던 문제, CSV 가 저장 위치를 묻지 않던 문제 수정
