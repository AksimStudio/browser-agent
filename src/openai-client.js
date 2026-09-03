import fs from "node:fs/promises";
import OpenAI from "openai";

export class OpenAIClient {
  constructor(options) {
    this.client = new OpenAI(options);
    this.image = null;
    this.chat = { completions: { create: (request) => this.create(request) } };
  }

  setImage(filename) { this.image = filename; }

  async create(request) {
    if (!this.image) return this.client.chat.completions.create(request);
    const filename = this.image;
    this.image = null;
    const data = await fs.readFile(filename, "base64");
    const messages = request.messages.map((message, index) => index === request.messages.length - 1
      ? { ...message, content: [{ type: "text", text: message.content }, { type: "image_url", image_url: { url: `data:image/png;base64,${data}`, detail: "low" } }] }
      : message);
    return this.client.chat.completions.create({ ...request, messages });
  }

  close() { return this.client.close(); }
}
