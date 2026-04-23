export interface PC {
  id: number;
  name: string;
  ip_local: string | null;
  online: boolean;
  locked: boolean;
  protected: boolean;
  agent_version: string | null;
  last_seen: string | null;
  group_id: number | null;
}

export interface Program {
  id: number;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  is_active: boolean;
}

export interface CommandRequest {
  command_type: string;
  target_type: 'single' | 'multi' | 'all';
  target_pc_id?: number;
  target_pc_ids?: number[];
  params?: Record<string, unknown>;
}

export interface CommandResponse {
  command_id: string;
  trace_id: string;
  status: string;
  target_count: number;
}
