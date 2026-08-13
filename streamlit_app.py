"""Streamlit Community Cloud entrypoint for the Gilsaegim demo."""

from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).resolve().parent
DEMO_FILE = ROOT / "gilsaegim-standalone.html"

st.set_page_config(
    page_title="길새김 | MOVE AI Challenge 2026",
    page_icon="🚚",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      header[data-testid="stHeader"], footer { display: none; }
      .stApp { background: #f4f7f8; }
      .block-container { max-width: 1720px; padding: 0.5rem 0.75rem 1rem; }
      iframe { border-radius: 16px; background: white; }
    </style>
    """,
    unsafe_allow_html=True,
)

if not DEMO_FILE.exists():
    st.error("시연 파일을 찾을 수 없습니다.")
    st.stop()

demo_html = DEMO_FILE.read_text(encoding="utf-8")
components.html(demo_html, height=1080, scrolling=True)
