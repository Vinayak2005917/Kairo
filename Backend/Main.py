from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from typing import List
import os
import requests
from fastapi.responses import StreamingResponse
from urllib.parse import unquote
import uvicorn
from Main import app 

# Node schema
class NodeData(BaseModel):
    id: str
    label: str
    x: float
    y: float
    width: float
    height: float
    color: str
    contentType: str
    content: str
    connections: List[str]

class NodeGraph(BaseModel):
    nodes: List[NodeData]

app = FastAPI()

# Allow React frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# File path
FILE_PATH = os.path.join(os.path.dirname(__file__), "nodes.json")

# GET: Load nodes from file
@app.get("/load")
def load_nodes():
    try:
        with open(FILE_PATH, "r") as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        return {"nodes": []}

# POST: Save nodes to file
@app.post("/save")
def save_nodes(graph: dict = Body(...)):
    """
    Accept a flexible JSON payload and persist the `nodes` key to disk.
    Using a free-form dict here avoids 422 errors when the frontend sends
    node objects that don't exactly match the Pydantic `NodeData` schema.
    """
    nodes = graph.get("nodes") if isinstance(graph, dict) else None
    if nodes is None:
        # fallback: try to write the whole payload under `nodes` key
        nodes = []
    with open(FILE_PATH, "w") as f:
        json.dump({"nodes": nodes}, f, indent=4)
    return {"status": "success"}


@app.get("/proxy-image")
def proxy_image(url: str):
    """
    Simple image proxy: fetches the remote URL and streams it back with the
    original Content-Type. Use for loading third-party images that block
    cross-origin access. Example: /proxy-image?url=https://example.com/img.jpg
    """
    # basic validation
    if not (url.startswith("http://") or url.startswith("https://")):
        return {"error": "invalid url"}

    try:
        # use a browser-like user agent to avoid some sites returning bot blocks
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        r = requests.get(url, stream=True, timeout=10, headers=headers, allow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"failed to fetch remote resource: {e}")

    content_type = (r.headers.get("Content-Type") or "").lower()
    # ensure we only proxy image/* types (reject html, video, etc.) to avoid surprises
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail=f"remote resource is not an image (Content-Type: {content_type})")

    return StreamingResponse(r.iter_content(chunk_size=8192), media_type=content_type)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))  # fallback to 8000 locally
    print(f"Starting backend server at http://0.0.0.0:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
