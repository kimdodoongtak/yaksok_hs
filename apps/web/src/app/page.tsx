import { JourneyHeader } from "@/components/ui/journey-header";
import { CreateInvitationForm } from "@/components/invitation/create-invitation-form";
export default function HomePage() {
  return <main className="app-entry"><JourneyHeader/>
    <section className="home-ticket" aria-labelledby="welcome-title">
      <p className="home-ticket-band">YAKSOK / MEETING PASS</p>
      <div>
        <p className="text-xs text-slate-500">함께 만날 시간을 정해요</p>
        <h1 id="welcome-title">약속 잡기 도우미</h1>
        <p className="break-keep text-sm leading-7 text-slate-500">약속을 만들고 초대 링크를 공유해 보세요.</p>
        <CreateInvitationForm />
      </div>
      <footer aria-hidden="true"><span>SEE YOU SOON</span><i/></footer>
    </section>
    <p className="mt-6 break-keep text-center text-sm leading-6 text-slate-500">초대받았다면 전달받은 링크를 열어 참여해 주세요.</p>
  </main>;
}
