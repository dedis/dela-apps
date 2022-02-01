export interface NodesEntity {
  id: string;
  color: string;
  addr: string;
  proxy: string;
  display: string;
  stop: boolean;
}

export interface nodes {
  nodes?: NodesEntity[] | null;
}
