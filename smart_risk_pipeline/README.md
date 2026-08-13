# Smart Risk Pipeline

This is a runnable prototype of the GPS risk-detection pipeline.

## Included Flow

1. 1-second smartphone GPS input
2. Haversine center-radius filter
3. Ray-casting polygon geofencing
4. Rolling speed anomaly detection
5. Confidence scoring
6. Final briefing text for popup/TTS/LLM trigger

## Files

```text
data/risk_zones.geojson   ROI polygon dataset
data/reports.csv          sample STT/field report log
src/risk_pipeline.py      pipeline engine
run_demo.py               20-second demo simulation
```

## Run

From the repository root, run:

```powershell
python .\smart_risk_pipeline\run_demo.py
```

## Facility Event Demo

```powershell
python .\smart_risk_pipeline\run_facility_demo.py
```

## GPS Storage Server

Start the local server:

```powershell
python .\smart_risk_pipeline\server.py
```

In another terminal, send sample GPS rows:

```powershell
python .\smart_risk_pipeline\send_sample_gps.py
```

Available endpoints:

```text
POST /gps
GET  /vehicles/latest
GET  /facilities/status
GET  /facilities/events
```

## Real App Integration

Replace the demo loop with real phone GPS data and pass each point to:

```python
decision = pipeline.process_gps(gps_point)
```

When `decision.llm_should_preload` is `True`, begin warming the LLM.
When `decision.llm_should_trigger` is `True`, show `decision.briefing` in the phone popup and send it to TTS.
