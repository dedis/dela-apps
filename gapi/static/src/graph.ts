export interface NodesEntity {
    id: string;
    color: string;
    addr: string;
    proxy: string;
  }

export interface graphi {
    nodes?: NodesEntity[] | null;
  }
