from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from typing import List

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
FILE_PATH = "nodes.json"

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
