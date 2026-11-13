export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-stone-50 px-6 py-16 text-stone-900">
      <section
        aria-labelledby="welcome-title"
        className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-8 sm:p-12"
      >
        <p className="text-sm font-medium text-stone-600">함께 만날 시간을 정해요</p>
        <h1
          id="welcome-title"
          className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          약속 잡기 도우미
        </h1>
        <p className="mt-6 leading-7 text-stone-600">
          모임의 약속을 더 쉽게 정할 수 있도록 준비하고 있어요.
        </p>
      </section>
    </main>
  );
}
