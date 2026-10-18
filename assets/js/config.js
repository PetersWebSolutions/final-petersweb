/* ==========================================================================
   PetersWeb Solutions — site configuration
   --------------------------------------------------------------------------
   This is the single place to add the business's real details.
   Anything left empty is handled gracefully on the page (no dead links).
   ========================================================================== */

window.PWS_CONFIG = {
  brand: {
    name: "PetersWeb Solutions",
    tagline: "Your Business Deserves to Be Found, Trusted, and Booked."
  },

  contact: {
    /* TODO: add the real email, e.g. "hello@yourdomain.com".
       While empty, email elements point to the inquiry form. */
    email: "",

    /* TODO: display phone and the tel: value, e.g. "+63 917 000 0000". */
    phoneDisplay: "",
    phone: "",

    /* TODO: add a real HTTPS Messenger destination, preferably
       "https://m.me/YourPage" (or a verified Facebook/Messenger message link).
       Only recognized Messenger destination hosts are opened externally.
       Leave empty until the real destination has been checked. The website
       does not prefill message text or transmit form details to Messenger. */
    messengerUrl: "",

    address: "Windsor Tower, Makati, Philippines",

    /* Google Maps — update these together if the address ever changes. */
    mapLink: "https://www.google.com/maps/search/?api=1&query=Windsor%20Tower%2C%20Makati%2C%20Philippines",
    mapEmbed: "https://www.google.com/maps?q=Windsor%20Tower%2C%20Makati%2C%20Philippines&output=embed",

    /* Optional. Leave empty to hide. Example: "Mon–Sat · 9:00 AM – 6:00 PM" */
    hours: ""
  },

  social: {
    /* TODO: paste full profile URLs. Unconfigured networks stay hidden. */
    facebook: "",
    instagram: "",
    /* Leave empty to reuse contact.messengerUrl for the Messenger icon. */
    messenger: "",
    linkedin: ""
  },

  /* ------------------------------------------------------------------------
     PORTFOLIO
     These live URLs are the approved destinations for the portfolio cards.
     Each card opens its matching live site inside the on-page preview popup. Keep each
     URL aligned with the corresponding project ID on the card in index.html.
     ------------------------------------------------------------------------ */
  portfolio: {
    "private-resort": {
      title: "Heaven Haven Resort — Private Resort Website",
      previewLabel: "Accommodation/ Private Resort Website",
      liveUrl: "https://heaven-haven.vercel.app/",
      conceptUrl: ""
    },
    "medical-clinic": {
      title: "FCN Medical and Vaccination Clinic",
      previewLabel: "Medical and Vaccination Clinic Website",
      liveUrl: "https://www.fcnvaccination.com/",
      conceptUrl: ""
    },
    "construction-design": {
      title: "DK Design and Build — Construction and Design Website",
      previewLabel: "Builders and Construction Website",
      liveUrl: "https://dk-design-and-build.vercel.app/",
      conceptUrl: ""
    },
    "massage-spa": {
      title: "Massage Spa Website",
      previewLabel: "Massage and Wellness Spa Website",
      liveUrl: "https://peterswebsolutions.github.io/massage-spa1/",
      conceptUrl: ""
    }
  },

  /* ------------------------------------------------------------------------
     TESTIMONIALS
     Use client-provided wording with publishing permission. Profile photos and
     `verified: true` are intentionally omitted until consented photos and
     verification are supplied; initials are used as neutral avatars.
     ------------------------------------------------------------------------ */
  testimonials: {
    enabled: true,
    items: [
      {
        quote: "PetersWeb made our website, and they are so professional to work with. Lagi silang nagco-communicate sa amin to make sure the website is working perfectly. They will do our management and inventory system as well.",
        name: "Dr. Frederict N.", initials: "FN", rating: 5, business: "Owner · FCN Vaccination and Medical Center"
      },
      {
        quote: "They are easy to work with. Their service is way cheaper than others. Ginagawa nila agad yung request namin and some minor adjustments. God bless your team, Sir Gerald!",
        name: "Winston Molina", initials: "WM", rating: 5, business: "Owner · Agnes Food Product"
      },
      {
        quote: "I have known Sir Gerald for a year na kaya sa kanila kami nagpagawa. Very down to earth. Thank you so much! More power sa'yo, Kuya!",
        name: "Beejay A.", initials: "BA", rating: 5
      },
      {
        quote: "I'm based here in Canada. I just found them on social media. Glad to have worked with them. I have also referred friends to them. Highly recommended. Five stars to the team!",
        name: "James S.", initials: "JS", rating: 5, business: "Entrepreneur"
      },
      {
        quote: "Cheapest in the market but premium websites! Thank you for your patience sa team namin. :) More projects to come!",
        name: "Adrian A.", initials: "AA", rating: 5
      },
      {
        quote: "They made the whole process simple. He understood what I wanted and turned it into a professional-looking website. Sulit and highly recommended!",
        name: "Daniel C.", initials: "DC", rating: 5
      },
      {
        quote: "I love how clean and modern our website looks. Mas professional na ang dating ng business namin, especially when sharing our link with potential customers.",
        name: "Jarijay R.", initials: "JR", rating: 5
      },
      {
        quote: "We wanted a website where guests could easily check our amenities and rates. PetersWeb helped bring that vision to life. Mas convenient na para sa customers namin!",
        name: "Ken A.", initials: "KA", rating: 5
      },
      {
        quote: "They were responsive and open to our suggestions. He made sure the website presented our services clearly. Highly recommended for businesses wanting to grow online!",
        name: "Arlene S.", initials: "AS", rating: 5
      }
    ]
  },

  form: {
    /* The included Python server accepts POSTs here and stores inquiries in
       data/inquiries.jsonl. If you deploy to a static host, replace this with
       a real form endpoint you control, or connect an email service/CRM. */
    endpoint: "/api/inquiries",
    minFillSeconds: 3
  }
};
