import type {
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
  PartitionInfo,
} from "../database.js";

export interface TableData {
  table: string;
  owner: string;
  rls: {
    enabled: boolean;
    force: boolean;
    policies: Array<{
      policy: string;
      cmd: string;
      roles: string[] | null;
      permissive: string;
      using?: string | null;
      with_check?: string | null;
    }>;
  };
  rbac: {
    table_grants: Array<{
      grantor: string;
      grantee: string;
      privilege: string;
      is_grantable: boolean;
    }>;
    column_grants: Array<{
      column_name: string;
      grantor: string;
      grantee: string;
      privilege: string;
      is_grantable: boolean;
    }>;
  };
  triggers: Array<{
    trigger_name: string;
    action_timing: string;
    event_manipulation: string;
    action_orientation: string;
    action_statement: string;
    action_condition: string | null;
    action_order: number;
  }>;
  /** pg_catalog column definitions (pg_dump-style exact types) */
  column_definitions: ColumnDefinition[];
  /** pg_catalog constraint definitions (exact via pg_get_constraintdef) */
  constraint_definitions: ConstraintDefinition[];
  /** pg_catalog index definitions */
  index_definitions: IndexDefinition[];
  /** Partition info (null if not partitioned) */
  partition_info: PartitionInfo | null;
  /** Table-level comment */
  comment?: string;
}
