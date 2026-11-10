import { beforeAll, describe, expect, it } from "vitest";
import { asUser, db } from "@/lib/db";
import * as m from "@/lib/mural/service";
import { mkUser } from "./helpers";

let sind: string, cons: string, cons2: string, mor: string, adm: string;
const base = { category: "comunicado" as const, title: "Manutenção dos elevadores", body: "Na **quinta-feira**, das 9h às 12h.", pinned: false, expiresOn: null, attachment: null };
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 32)]);

beforeAll(async () => {
  sind = await mkUser({ roles: ["sindico"] }); cons = await mkUser({ roles: ["conselheiro"] }); cons2 = await mkUser({ roles: ["conselheiro"] });
  mor = await mkUser({ unit: "905" }); adm = await mkUser({ roles: ["admin"] });
});

describe("Mural de avisos", () => {
  it("síndico publica, todos leem e recebem aviso no sino", async () => {
    const { id } = await m.createPost({ id: sind, label: "Sílvio" }, { ...base, as: "sindico", notify: true });
    const list = await m.listPosts(mor);
    expect(list.find((p) => p.id === id)).toMatchObject({ author_role: "sindico", lido: false });
    expect(await m.unreadCount(mor)).toBeGreaterThan(0);
    const [n] = await db()`select title, link from notifications where user_id = ${mor} order by created_at desc limit 1`;
    expect(n).toMatchObject({ title: "Mural · Síndico: Manutenção dos elevadores", link: `/mural/${id}` });
    const r = await m.getPost(mor, id);
    expect(r?.stats).toBeNull(); // morador não vê estatísticas
    expect((await m.listPosts(mor)).find((p) => p.id === id)?.lido).toBe(true);
    const s = await m.getPost(sind, id);
    expect(s?.stats).toMatchObject({ pessoas: 2, unidades: 1 });
  });

  it("só publica com o próprio perfil; morador não publica", async () => {
    await expect(m.createPost({ id: mor, label: "M" }, { ...base, as: "sindico", notify: false })).rejects.toThrow(/não pode publicar/);
    await expect(m.createPost({ id: cons, label: "C" }, { ...base, as: "sindico", notify: false })).rejects.toThrow(/não pode publicar/);
    const { id } = await m.createPost({ id: cons, label: "Clara" }, { ...base, as: "conselho", notify: false, attachment: { name: "ata.pdf", mime: "application/pdf", data: pdf } });
    // outro conselheiro pode editar aviso do Conselho; síndico não
    await m.updatePost({ id: cons2, label: "Caio" }, id, { ...base, title: "Ata da reunião do Conselho" });
    await expect(m.updatePost({ id: sind, label: "S" }, id, base)).rejects.toThrow(/não pode alterar/);
    expect((await m.getAttachment(mor, id))?.mime).toBe("application/pdf");
    // morador não lê a coluna do anexo diretamente
    await expect(asUser(mor, (tx) => tx`select attachment from board_posts where id = ${id}`)).rejects.toThrow();
    await m.archivePost({ id: adm, label: "Adm" }, id, "Substituído por nova ata");
    expect((await m.listPosts(mor)).find((p) => p.id === id)).toBeUndefined();
    expect(await m.getAttachment(mor, id)).toBeNull();
    const hist = await db()`select action from audit_log where entity = 'board_post' and entity_id = ${id} order by id`;
    expect(hist.map((h) => h.action)).toEqual(["mural.publicacao", "mural.edicao", "mural.arquivamento"]);
  });

  it("valida anexos e validade", () => {
    const f = (name: string) => ({ name, size: 10 }) as File;
    expect(m.checkAttachment(f("ata.pdf"), pdf)?.mime).toBe("application/pdf");
    expect(() => m.checkAttachment(f("x.exe"), Buffer.from("MZ\x90\x00"))).toThrow(/PDF ou uma imagem/);
    expect(() => m.checkAttachment(f("grande.pdf"), Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]))).toThrow(/5 MB/);
    return expect(m.createPost({ id: sind, label: "S" }, { ...base, as: "sindico", notify: false, expiresOn: "2020-01-01" })).rejects.toThrow(/validade/);
  });
});
