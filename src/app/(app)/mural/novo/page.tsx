import { redirect } from "next/navigation";
import { publicarAvisoAction } from "@/app/actions/mural";
import { requireUser } from "@/lib/auth";
import { AUTHOR_LABEL, CATEGORIES, publishAs } from "@/lib/mural/service";
import { PostForm } from "../PostForm";

export const metadata = { title: "Novo aviso" };

export default async function NovoAviso() {
  const me = await requireUser();
  const as = publishAs(me.roles);
  if (!as.length) redirect("/mural");
  return (
    <div className="space-y-6">
      <h1 className="h1">Novo aviso</h1>
      <PostForm action={publicarAvisoAction} submitLabel="Publicar no mural" asOptions={as.map((k) => [k, AUTHOR_LABEL[k]])} categories={Object.entries(CATEGORIES)} />
    </div>
  );
}
