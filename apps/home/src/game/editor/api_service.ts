import { Terrain } from "../core/board";

export interface ApiLevelPayload {
  rows: number;
  cols: number;
  tiles: Array<{
    x: number;
    y: number;
    textureName: string;
    sectionName: string;
    type: Terrain;
  }>;
}

export default class Api {
  static async getList() {
    const res = await fetch("/levels");
    const data = await res.json();
    return data.levels as string[];
  }

  static async get(name: string) {
    const res = await fetch(`/levels/${name}`);
    return res.json();
  }

  static save(name: string, payload: ApiLevelPayload) {
    return fetch(`/levels/${name}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  static async create(name: string) {
    if (!name) {
      throw new Error("Name is required");
    }

    const res = await fetch(`/levels/${name}`, { method: "PUT" });
    const data = await res.json();

    if (data.error) {
      throw data.error;
    }
  }
}
