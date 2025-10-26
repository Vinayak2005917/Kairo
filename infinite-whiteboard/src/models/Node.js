export class Node {
  constructor({
    id,
    label = "Untitled",
    text = "",
    mediaType = "none", // "none" | "image" | "video" | "audio" | "pdf"
    mediaSrc = "",
    x = 0,
    y = 0,
    width = 180,
    height = 150,
    color = "#bbdefb",
    expanded = true,
    connections = [],
    // backwards compatibility fields
    content = undefined,
    image = undefined,
  }) {
    this.id = id;
    this.label = label;
    // prefer new fields, fall back to older ones if present
    this.text = typeof text === "string" ? text : (typeof content === "string" ? content : "");
    this.mediaType = mediaType;
    this.mediaSrc = mediaSrc || image || "";
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.expanded = expanded;
    this.connections = connections;
  }
}
