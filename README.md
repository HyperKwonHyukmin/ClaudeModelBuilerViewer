# ClaudeModelBuilderViewer

1D Beam FEM 파이프라인 뷰어 — Three.js 기반 웹 애플리케이션

## 실행 방법

### 1. 사전 설치

**Node.js** v18 이상 설치 (https://nodejs.org)

### 2. 저장소 클론

```bash
git clone https://github.com/HyperKwonHyukmin/ClaudeModelBuilerViewer.git
cd ClaudeModelBuilerViewer
```

### 3. 의존성 설치

```bash
cd viewer
npm install
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

---

## 주의사항

- **폴더 열기** 기능(`showDirectoryPicker`)은 **Chrome / Edge** 에서만 동작합니다. Firefox, Safari 미지원.
- **JSON 데이터**(`csv/` 폴더)는 저장소에 포함되어 있지 않습니다. 별도로 복사해야 합니다.
- `npm install`은 루트가 아닌 **`viewer/` 폴더** 안에서 실행해야 합니다.
