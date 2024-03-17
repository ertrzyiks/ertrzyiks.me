import type { ApiLevelPayload } from "./api_service";

export enum EditorEventType {
  SetSize,
  LoadBoard,
  SetTileTexture,
  SetTileSectionName,
}

export interface AbstractEvent {
  type: EditorEventType;
}

export interface SetSizeEvent extends AbstractEvent {
  type: EditorEventType.SetSize;
  rows: number;
  cols: number;
}

export interface LoadBoardEvent extends AbstractEvent {
  type: EditorEventType.LoadBoard;
  data: ApiLevelPayload;
}

export interface SetTileTextureEvent extends AbstractEvent {
  type: EditorEventType.SetTileTexture;
  x: number;
  y: number;
  textureName: string;
}

export interface SetTileSectionNameEvent extends AbstractEvent {
  type: EditorEventType.SetTileSectionName;
  x: number;
  y: number;
  sectionName: string;
}

export type EditorEvent =
  | SetSizeEvent
  | LoadBoardEvent
  | SetTileTextureEvent
  | SetTileSectionNameEvent;
