// Shown instead of the app when the build has no usable Supabase settings.
// It names what's missing but never prints the values themselves.
export default function ConfigError({ problems }: { problems: string[] }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div role="alert" className="w-full max-w-md bg-white rounded-2xl ring-1 ring-red-200 p-6 space-y-3">
        <h1 className="text-lg font-bold text-red-800">App misconfigured: missing Supabase URL/key</h1>
        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="text-sm text-slate-600">
          In Vercel → Project → Settings → Environment Variables, set the Supabase URL and anon key, then redeploy.
          Values are read when the site is built, so changing them requires a new deployment.
        </p>
      </div>
    </main>
  )
}
