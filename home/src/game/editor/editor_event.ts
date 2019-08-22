import {ApiLevelPayload} from './api_service'

export enum EditorEventType {
  SetSize,
  LoadBoard
}

export interface AbstractEvent {
  type: EditorEventType
}

export interface SetSizeEvent extends AbstractEvent {
  type: EditorEventType.SetSize,
  rows: number,
  cols: number
}

export interface LoadBoardEvent extends AbstractEvent {
  type: EditorEventType.LoadBoard,
  data: ApiLevelPayload
}


export type EditorEvent = SetSizeEvent | LoadBoardEvent
