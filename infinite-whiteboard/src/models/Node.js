export class Node {
  constructor({ id, label = "Untitled", x = 0, y = 0, width = 150, height = 80, color = "#90caf9", content = "", image = null, connections = [], expanded = true }) {
    this.id = id;
    this.label = label;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.content = content;
    this.image = image;
    this.connections = connections;
    this.expanded = expanded;
  }
}
