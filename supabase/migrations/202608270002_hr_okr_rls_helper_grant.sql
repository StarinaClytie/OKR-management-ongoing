-- The HR OKR read policies execute this private helper as the querying role.
-- The original HR migration revoked PUBLIC's default function privilege but
-- omitted the explicit authenticated grant, causing every affected RLS query
-- to fail with SQLSTATE 42501.

grant execute on function private.can_hr_read_objective(uuid) to authenticated;

notify pgrst, 'reload schema';
