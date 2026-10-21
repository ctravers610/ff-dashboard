import type { SourceError } from '@ffd/shared';

// Problems loading a league or service. ESPN refusing the saved cookies gets one
// banner that says how to fix it, however many ESPN leagues it affects.
export function SourceErrors({ errors, className = '' }: { errors: SourceError[]; className?: string }) {
  const cookies = errors.filter((e) => e.code === 'espn-cookies');
  const other = errors.filter((e) => e.code !== 'espn-cookies');
  if (errors.length === 0) return null;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {cookies.length > 0 && (
        <div role="alert" className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-100">
          <p className="font-semibold">
            ESPN stopped accepting your cookies, so {cookies.length === 1 ? 'an ESPN league' : `${cookies.length} ESPN leagues`} can't load.
          </p>
          <p className="mt-1 text-rose-200">
            Sign in at espn.com, copy the <code>espn_s2</code> and <code>SWID</code> cookies again, and update <code>ESPN_S2</code> and{' '}
            <code>ESPN_SWID</code>: in <code>.env</code> on your computer, and on Render (ffd-app, then Environment) for the live site.
          </p>
        </div>
      )}
      {other.map((e) => (
        <div key={e.source} className="rounded-lg bg-amber-950/60 p-3 text-sm text-amber-200">
          <span className="font-medium">{e.source}:</span> {e.message}
        </div>
      ))}
    </div>
  );
}
