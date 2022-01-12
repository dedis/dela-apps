export interface NodesEntity {
  id: string;
  color: string;
  addr: string;
  proxy: string;
}

export interface nodes {
  nodes?: NodesEntity[] | null;
}
