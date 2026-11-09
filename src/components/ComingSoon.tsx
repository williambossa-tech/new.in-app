import { Corujinha, type Pose } from "./Corujinha";

export function ComingSoon({ title, pose, text, art }: { title: string; pose: Pose; text: string; art?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center rounded-[28px] bg-white px-8 py-16 text-center ring-1 ring-linha sm:py-24">
      {art ?? <Corujinha pose={pose} size={150} className="owl-bob" alt="" />}
      <p className="mt-8 text-sm font-medium text-violeta">Em breve</p>
      <h1 className="h1 mt-1">{title}</h1>
      <p className="mt-3 max-w-md text-noite-70">{text}</p>
    </section>
  );
}
