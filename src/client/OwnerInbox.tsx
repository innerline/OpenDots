import type { OwnerInbox as OwnerInboxData } from '../shared/types';
import { Mascot } from './Mascot';

/**
 * Brian's inbox — asks filed by the team, answered by replying in chat.
 * Cards carry no actions on purpose: the conversation is the interface.
 */
export function OwnerInbox({ inbox }: { inbox: OwnerInboxData }) {
  const asks = inbox.asks.filter((ask) => ask.for === 'honey');
  return (
    <>
      <div className="inbox-list">
        {asks.map((ask) => (
          <article className="inbox-card" key={ask.id}>
            <h3>{ask.title}</h3>
            <p>{ask.body}</p>
            <p className="inbox-how">{ask.how}</p>
          </article>
        ))}
      </div>
      {!asks.length && (
        <div className="large-empty">
          <Mascot />
          <h2>Nothing waiting on you.</h2>
          <p>When Honey needs your word on something, it lands here.</p>
        </div>
      )}
      {!!inbox.whenever.length && (
        <section className="inbox-whenever">
          <h2>Whenever</h2>
          <ul>
            {inbox.whenever.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
