# Streamlit Community Cloud 배포

이 저장소는 루트의 `streamlit_app.py`를 엔트리 파일로 사용합니다.

## 배포 전 갱신

UI를 수정한 뒤 독립 실행 HTML을 다시 생성합니다.

```powershell
node build_streamlit_bundle.js
```

생성되는 `gilsaegim-standalone.html`에는 현재 `index.html`, CSS, JavaScript,
이미지 자산이 모두 포함됩니다.

## Community Cloud 설정

1. Streamlit Community Cloud에서 **Create app**을 선택합니다.
2. Repository에 `route-whisper/MOVE-AI`를 선택합니다.
3. Branch는 `main`, Main file path는 `streamlit_app.py`로 지정합니다.
4. 배포 후 생성된 `https://...streamlit.app` 주소를 제출합니다.

필수 파일은 다음과 같습니다.

- `streamlit_app.py`
- `gilsaegim-standalone.html`
- `requirements.txt`
- `.streamlit/config.toml`
