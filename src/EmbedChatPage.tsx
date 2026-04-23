import ChatWidget from './components/ChatWidget';

/**
 * Embed mode: renders ChatWidget full-screen inside an iframe.
 * Used by the embeddable widget (public/widget.js) via /embed/chat route.
 * - isOpen is always true (iframe visibility controlled by widget.js)
 * - onClose is a no-op (X button hidden via embedded=true prop)
 * - embedded=true switches ChatWidget layout to absolute inset-0
 *
 * TODO (multi-tenant): read clinic_id from URL param and pass to ChatWidget
 * when ChatWidget supports dynamic clinic config from DB.
 */
export default function EmbedChatPage() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <ChatWidget isOpen={true} onClose={() => {}} embedded={true} />
    </div>
  );
}
