from fastapi import FastAPI
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
def save_nodes(graph: NodeGraph):
    with open(FILE_PATH, "w") as f:
        json.dump(graph.dict(), f, indent=4)
    return {"status": "success"}
