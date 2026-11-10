import { notFound } from "next/navigation";
import { editarAvisoAction } from "@/app/actions/mural";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, getPost } from "@/lib/mural/service";
import { PostForm } from "../../PostForm";

export const metadata = { title: "Editar aviso" };

export default async function EditarAviso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireUser();
  const r = await getPost(me.id, id);
  if (!r || r.post.status !== "publicado") notFound();
  const p = r.post;
  return (
    <div className="space-y-6">
      <h1 className="h1">Editar aviso</h1>
      <PostForm action={editarAvisoAction} submitLabel="Salvar alterações" categories={Object.entries(CATEGORIES)}
        initial={{ id: p.id, category: p.category, title: p.title, body: p.body, pinned: p.pinned, expiresOn: p.expires_on ? new Date(p.expires_on).toISOString().slice(0, 10) : "", attachmentName: p.attachment_name }} />
    </div>
  );
}
