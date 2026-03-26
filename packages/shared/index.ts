export type ItemType = "article" | "tweet" | "image" | "video" | "pdf" | "note";

export interface SaveItemInput {
  url: string;
  title?: string;
  type?: ItemType;
  note?: string;
  highlight?: string;
}

export interface ItemRecord {
  id: string;
  url: string;
  title: string;
  type: ItemType;
  contentText?: string;
  createdAt: string;
}
