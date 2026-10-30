/* Fairway Conquest: the one place to plug in outside services. */
window.FC_CONFIG = {
  /* Kit (ConvertKit) email list. Leave blank until the Kit form exists.
     In Kit: Grow > Landing Pages & Forms > your form > Embed > HTML. The form tag reads
       action="https://app.kit.com/forms/1234567/subscriptions"   (older embeds: app.convertkit.com)
     Paste just the number into KIT_FORM_ID, or the whole URL into KIT_FORM_ACTION.
     Until then, signups are kept on this phone and sent automatically once this is filled in. */
  KIT_FORM_ID: "",
  KIT_FORM_ACTION: "",
  PLAN_TITLE: "30-Day Practice Plan to Break 90",

  /* Live 2-phone matches use PeerJS. Empty = PeerJS's free public broker (0.peerjs.com).
     To self-host later: { host: "your-peer-server.example.com", port: 443, path: "/", secure: true } */
  PEER: {}
};
