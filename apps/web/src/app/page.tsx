import { JourneyHeader } from "@/components/ui/journey-header";
export default function HomePage() {
  return <main className="app-entry"><JourneyHeader/>
    <section className="home-ticket" aria-labelledby="welcome-title">
      <p className="home-ticket-band">YAKSOK / MEETING PASS</p>
      <div><p className="text-xs text-slate-500">함께 만날 시간을 정해요</p><h1 id="welcome-title">약속 잡기 도우미</h1><p>초대 링크를 열어 약속에 참여해 주세요.</p></div>
      <footer aria-hidden="true"><span>SEE YOU SOON</span><i/></footer>
    </section>
    <p className="mt-6 text-center text-sm text-slate-500">모임의 약속을 더 쉽게 정할 수 있도록 준비하고 있어요.</p>
  </main>;
}
