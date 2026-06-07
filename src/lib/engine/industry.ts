/**
 * Lightweight industry classifier + knowledge base. Maps a free-text business
 * idea onto a known industry profile that supplies vocabulary used throughout
 * the deterministic engine (naming morphemes, competitor archetypes, channels,
 * value propositions, etc.). This is what makes key-free output feel bespoke
 * rather than generic.
 */

export interface IndustryProfile {
  key: string;
  label: string;
  keywords: string[];
  prefixes: string[];
  suffixes: string[];
  roots: string[];
  valueProps: string[];
  competitorArchetypes: { name: string; descriptor: string }[];
  channels: string[];
  painPoints: string[];
  goals: string[];
  services: { title: string; description: string }[];
  contentTopics: string[];
  iconHints: string[];
}

const PROFILES: IndustryProfile[] = [
  {
    key: "food",
    label: "Food & Beverage",
    keywords: ["restaurant", "cafe", "coffee", "bakery", "food", "kitchen", "catering", "bar", "pizza", "burger", "juice", "tea", "dessert", "bistro", "deli", "eatery", "diner"],
    prefixes: ["Fresh", "Golden", "Urban", "Rustic", "Daily", "The"],
    suffixes: ["Kitchen", "& Co", "House", "Table", "Bar", "Collective"],
    roots: ["Ember", "Harvest", "Cocoa", "Saffron", "Maple", "Basil", "Hearth", "Crumb", "Verde"],
    valueProps: ["Locally sourced ingredients", "Made fresh daily", "Crafted by hand", "Seasonal menu rotation", "Fast, friendly service"],
    competitorArchetypes: [
      { name: "Established neighborhood favorite", descriptor: "Loyal regulars and strong word-of-mouth" },
      { name: "National chain", descriptor: "Aggressive pricing and brand recognition" },
      { name: "Trendy newcomer", descriptor: "Heavy social media presence" },
    ],
    channels: ["Instagram", "Google Business Profile", "TikTok", "Local delivery apps", "Email"],
    painPoints: ["Hard to find consistently good quality nearby", "Long wait times", "Limited healthy options", "Inconsistent service"],
    goals: ["Enjoy a memorable meal", "Find a reliable local spot", "Eat well without overspending", "Discover new flavors"],
    services: [
      { title: "Dine-In Experience", description: "A warm, thoughtfully designed space for every occasion." },
      { title: "Takeaway & Delivery", description: "Your favorites, ready when you are." },
      { title: "Catering & Events", description: "Crowd-pleasing menus for gatherings of any size." },
    ],
    contentTopics: ["Behind the kitchen", "Ingredient spotlights", "Customer favorites", "Seasonal specials", "Meet the team"],
    iconHints: ["leaf", "flame", "cup"],
  },
  {
    key: "fitness",
    label: "Fitness & Wellness",
    keywords: ["gym", "fitness", "yoga", "pilates", "wellness", "trainer", "workout", "health", "spa", "massage", "nutrition", "crossfit", "studio", "coaching"],
    prefixes: ["Pure", "Peak", "Vital", "Core", "Elevate", "Iron"],
    suffixes: ["Studio", "Lab", "Collective", "Method", "Co", "Club"],
    roots: ["Pulse", "Apex", "Forge", "Flow", "Summit", "Kinetic", "Thrive", "Ascend"],
    valueProps: ["Expert-led programming", "Personalized plans", "Supportive community", "Results you can measure", "Flexible scheduling"],
    competitorArchetypes: [
      { name: "Big-box gym", descriptor: "Low prices, high churn, impersonal" },
      { name: "Boutique studio", descriptor: "Premium pricing, strong community" },
      { name: "At-home app", descriptor: "Convenient and cheap, lacks accountability" },
    ],
    channels: ["Instagram", "TikTok", "Referral program", "Local partnerships", "Email"],
    painPoints: ["Lack of motivation", "Don't know where to start", "Plateauing results", "Intimidating gym environments"],
    goals: ["Get stronger and healthier", "Build a sustainable routine", "Feel confident", "Find accountability"],
    services: [
      { title: "1:1 Coaching", description: "Personalized programming and accountability." },
      { title: "Group Classes", description: "High-energy sessions that build community." },
      { title: "Nutrition Guidance", description: "Sustainable plans that fit your life." },
    ],
    contentTopics: ["Transformation stories", "Form tutorials", "Recovery tips", "Meal prep ideas", "Coach spotlights"],
    iconHints: ["bolt", "heart", "activity"],
  },
  {
    key: "beauty",
    label: "Beauty & Personal Care",
    keywords: ["salon", "barber", "beauty", "hair", "nails", "skincare", "cosmetics", "makeup", "lash", "aesthetics", "spa", "grooming", "tattoo"],
    prefixes: ["Lush", "Velvet", "Luxe", "Glow", "Bare", "House of"],
    suffixes: ["Studio", "Atelier", "Beauty", "Lab", "Bar", "Salon"],
    roots: ["Lumen", "Bloom", "Sable", "Aura", "Petal", "Gloss", "Muse", "Halo"],
    valueProps: ["Licensed specialists", "Premium products", "Tailored to you", "Relaxing atmosphere", "Visible results"],
    competitorArchetypes: [
      { name: "High-street chain salon", descriptor: "Convenient but generic experience" },
      { name: "Independent stylist", descriptor: "Personal but limited capacity" },
      { name: "Luxury spa", descriptor: "Premium pricing and exclusivity" },
    ],
    channels: ["Instagram", "TikTok", "Booking platforms", "Referrals", "Google Business Profile"],
    painPoints: ["Inconsistent results", "Hard to get appointments", "Feeling rushed", "Pushy upselling"],
    goals: ["Look and feel their best", "Find a trusted specialist", "A relaxing self-care ritual", "Lasting results"],
    services: [
      { title: "Signature Treatments", description: "Our most-loved services, refined to perfection." },
      { title: "Consultations", description: "Personalized recommendations for your goals." },
      { title: "Memberships", description: "Ongoing care with member-only perks." },
    ],
    contentTopics: ["Before & after", "Product breakdowns", "Aftercare tips", "Trend reports", "Client spotlights"],
    iconHints: ["sparkle", "heart", "star"],
  },
  {
    key: "tech",
    label: "Technology & SaaS",
    keywords: ["app", "software", "saas", "platform", "ai", "tech", "automation", "data", "api", "cloud", "dashboard", "analytics", "tool", "developer", "digital"],
    prefixes: ["Get", "Use", "Try", "Hyper", "Next", "Open"],
    suffixes: ["Labs", "AI", "HQ", "Stack", "Flow", "OS"],
    roots: ["Nova", "Vertex", "Quanta", "Cortex", "Pulse", "Orbit", "Cipher", "Lumen"],
    valueProps: ["Save hours every week", "Built for scale", "Secure by design", "Integrates with your stack", "No-code setup"],
    competitorArchetypes: [
      { name: "Incumbent enterprise suite", descriptor: "Feature-rich but bloated and expensive" },
      { name: "Open-source alternative", descriptor: "Free but requires heavy setup" },
      { name: "Point solution", descriptor: "Narrow focus, limited workflow coverage" },
    ],
    channels: ["Product Hunt", "LinkedIn", "Content/SEO", "Cold email", "Developer communities"],
    painPoints: ["Manual, repetitive work", "Tools that don't talk to each other", "Steep learning curves", "Hidden costs"],
    goals: ["Automate busywork", "Make better decisions with data", "Scale without adding headcount", "Ship faster"],
    services: [
      { title: "Core Platform", description: "Everything you need in one connected workspace." },
      { title: "Integrations", description: "Connect the tools your team already uses." },
      { title: "Enterprise", description: "Advanced security, SSO, and dedicated support." },
    ],
    contentTopics: ["Product deep-dives", "Customer case studies", "Industry benchmarks", "How-to guides", "Changelog"],
    iconHints: ["bolt", "grid", "orbit"],
  },
  {
    key: "ecommerce",
    label: "E-commerce & Retail",
    keywords: ["shop", "store", "ecommerce", "retail", "boutique", "clothing", "fashion", "apparel", "jewelry", "accessories", "merch", "goods", "products", "brand"],
    prefixes: ["The", "Shop", "Maison", "House of", "Wear", "Daily"],
    suffixes: ["Co", "Goods", "Supply", "Studio", "Label", "Collective"],
    roots: ["Linen", "Atlas", "Ivory", "Nomad", "Stitch", "Ember", "Onyx", "Wilder"],
    valueProps: ["Premium materials", "Ethically made", "Free & easy returns", "Designed to last", "Fast shipping"],
    competitorArchetypes: [
      { name: "Fast-fashion giant", descriptor: "Cheap, trend-driven, low quality" },
      { name: "Marketplace seller", descriptor: "Wide selection, weak brand" },
      { name: "Premium heritage brand", descriptor: "High quality, high price" },
    ],
    channels: ["Instagram", "TikTok", "Meta Ads", "Email/SMS", "Influencer partnerships"],
    painPoints: ["Poor quality that wears out", "Confusing sizing", "Slow shipping", "Hard returns"],
    goals: ["Find pieces they love", "Shop with confidence", "Support brands they trust", "Get great value"],
    services: [
      { title: "New Arrivals", description: "Fresh drops added every season." },
      { title: "Best Sellers", description: "Customer favorites, restocked regularly." },
      { title: "Gift & Bundles", description: "Curated sets for every occasion." },
    ],
    contentTopics: ["Styling guides", "Behind the design", "Customer reviews", "Material stories", "Seasonal lookbooks"],
    iconHints: ["bag", "star", "grid"],
  },
  {
    key: "services",
    label: "Professional Services",
    keywords: ["consulting", "agency", "law", "legal", "accounting", "finance", "marketing", "design", "architecture", "real estate", "insurance", "recruiting", "advisory", "studio"],
    prefixes: ["The", "North", "Meridian", "Summit", "Cardinal", "Atlas"],
    suffixes: ["Group", "Partners", "Advisory", "Studio", "& Associates", "Collective"],
    roots: ["Meridian", "Beacon", "Anchor", "Keystone", "Vantage", "Compass", "Sterling", "Haven"],
    valueProps: ["Senior-level expertise", "Tailored strategy", "Transparent pricing", "Proven track record", "Hands-on partnership"],
    competitorArchetypes: [
      { name: "Big-name firm", descriptor: "Prestige and reach, premium fees" },
      { name: "Solo freelancer", descriptor: "Affordable but limited bandwidth" },
      { name: "Generalist agency", descriptor: "Broad but lacks specialization" },
    ],
    channels: ["LinkedIn", "Referrals", "Content/SEO", "Networking events", "Email"],
    painPoints: ["Generic, cookie-cutter advice", "Unresponsive providers", "Opaque pricing", "Lack of measurable results"],
    goals: ["Solve a high-stakes problem", "Find a trusted expert", "Get measurable outcomes", "Reduce risk"],
    services: [
      { title: "Strategy & Advisory", description: "Clarity and a roadmap to your goals." },
      { title: "Implementation", description: "Hands-on delivery, done right." },
      { title: "Ongoing Partnership", description: "Continuous support as you grow." },
    ],
    contentTopics: ["Client results", "Industry insights", "Frameworks & playbooks", "Team expertise", "FAQs answered"],
    iconHints: ["compass", "shield", "grid"],
  },
  {
    key: "education",
    label: "Education & Coaching",
    keywords: ["course", "school", "academy", "tutoring", "education", "learning", "training", "coaching", "workshop", "bootcamp", "class", "mentor", "teach"],
    prefixes: ["The", "Bright", "Learn", "Master", "Open", "Future"],
    suffixes: ["Academy", "School", "Lab", "Institute", "Collective", "Method"],
    roots: ["Lumina", "Scholar", "Beacon", "Ascend", "Mentor", "Catalyst", "Forge", "Atlas"],
    valueProps: ["Learn by doing", "Expert instructors", "Real outcomes", "Flexible & self-paced", "Supportive cohort"],
    competitorArchetypes: [
      { name: "Massive online platform", descriptor: "Huge catalog, low completion rates" },
      { name: "Traditional institution", descriptor: "Credible but slow and expensive" },
      { name: "Free content creator", descriptor: "Accessible but unstructured" },
    ],
    channels: ["YouTube", "Instagram", "Email", "LinkedIn", "Community/Discord"],
    painPoints: ["Information overload", "No clear path", "Lack of accountability", "Outdated material"],
    goals: ["Master a new skill", "Advance their career", "Learn efficiently", "Get real results"],
    services: [
      { title: "Flagship Program", description: "A structured path from beginner to confident." },
      { title: "Live Workshops", description: "Hands-on sessions with expert feedback." },
      { title: "Community Access", description: "Learn alongside a motivated cohort." },
    ],
    contentTopics: ["Student wins", "Quick tutorials", "Common mistakes", "Curriculum previews", "Career advice"],
    iconHints: ["star", "grid", "compass"],
  },
  {
    key: "health",
    label: "Health & Medical",
    keywords: ["dental", "dentist", "clinic", "medical", "doctor", "therapy", "therapist", "physio", "chiropractic", "health", "healthcare", "orthodontic", "optometry", "veterinary", "vet", "psychology", "counseling", "nurse", "pharmacy", "wellness clinic", "mental health"],
    prefixes: ["Bright", "Pure", "Care", "Vital", "Gentle", "True"],
    suffixes: ["Health", "Care", "Clinic", "Medical", "Dental", "Practice"],
    roots: ["Aria", "Lumen", "Vita", "Serene", "Pillar", "Haven", "Cedar", "Meridian"],
    valueProps: ["Patient-first care", "Gentle, modern approach", "Same-week appointments", "Transparent treatment plans", "Highly qualified specialists"],
    competitorArchetypes: [
      { name: "Established local practice", descriptor: "Trusted but often booked out and dated" },
      { name: "Corporate clinic chain", descriptor: "Convenient hours, impersonal experience" },
      { name: "Budget provider", descriptor: "Low prices, variable quality of care" },
    ],
    channels: ["Google Business Profile", "Local SEO", "Referrals", "Instagram", "Email reminders"],
    painPoints: ["Long wait times for appointments", "Anxiety about visits", "Surprise out-of-pocket costs", "Feeling rushed by providers"],
    goals: ["Feel healthy and cared for", "A provider they can trust", "Clear, affordable treatment", "A calm, comfortable experience"],
    services: [
      { title: "New Patient Consultations", description: "A thorough, unhurried first visit and care plan." },
      { title: "Routine & Preventive Care", description: "Stay ahead of problems with regular visits." },
      { title: "Specialist Treatments", description: "Advanced care delivered with a gentle touch." },
    ],
    contentTopics: ["Patient education", "Meet the practitioners", "Care tips", "What to expect", "Patient stories"],
    iconHints: ["shield", "heart", "leaf"],
  },
  {
    key: "hospitality",
    label: "Hospitality & Travel",
    keywords: ["hotel", "hostel", "resort", "bnb", "airbnb", "travel", "tour", "tours", "tourism", "guesthouse", "lodge", "vacation", "rental", "experience", "retreat", "events", "venue", "wedding"],
    prefixes: ["The", "Casa", "Stay", "Wander", "Coastal", "Urban"],
    suffixes: ["Stays", "Retreats", "Collective", "House", "Escapes", "Co"],
    roots: ["Azure", "Solace", "Haven", "Lumen", "Voyage", "Terra", "Marisol", "Aurora"],
    valueProps: ["Unforgettable local experiences", "Effortless booking", "Thoughtful hospitality", "Hand-picked locations", "Hassle-free stays"],
    competitorArchetypes: [
      { name: "Global booking platform", descriptor: "Huge inventory, generic and impersonal" },
      { name: "Legacy hotel brand", descriptor: "Reliable but uninspiring and pricey" },
      { name: "Independent host", descriptor: "Characterful but inconsistent service" },
    ],
    channels: ["Instagram", "TikTok", "Booking platforms", "Google", "Email"],
    painPoints: ["Hidden fees and surprises", "Disappointing vs. photos", "Complicated booking", "Generic, touristy experiences"],
    goals: ["A memorable trip", "Stress-free planning", "Authentic local experiences", "Great value for money"],
    services: [
      { title: "Stays & Bookings", description: "Hand-picked places to stay, easy to book." },
      { title: "Curated Experiences", description: "Local experiences you'll actually remember." },
      { title: "Events & Groups", description: "Tailored hospitality for groups and occasions." },
    ],
    contentTopics: ["Destination guides", "Guest stories", "Behind the experience", "Local tips", "Seasonal offers"],
    iconHints: ["compass", "star", "wave"],
  },
  {
    key: "home",
    label: "Home & Trades",
    keywords: ["cleaning", "plumbing", "electrician", "landscaping", "construction", "renovation", "handyman", "hvac", "roofing", "painting", "moving", "repair", "garden", "interior"],
    prefixes: ["Pro", "Reliable", "Premier", "All", "Solid", "Clear"],
    suffixes: ["Services", "Co", "Pros", "Works", "Solutions", "& Sons"],
    roots: ["Cornerstone", "Anchor", "Bluepeak", "Homestead", "Trueline", "Hearth", "Granite", "Maple"],
    valueProps: ["Licensed & insured", "Upfront pricing", "On-time, every time", "Satisfaction guaranteed", "Local & trusted"],
    competitorArchetypes: [
      { name: "Large franchise", descriptor: "Recognizable but impersonal" },
      { name: "Independent operator", descriptor: "Cheap but inconsistent availability" },
      { name: "Online marketplace", descriptor: "Convenient but variable quality" },
    ],
    channels: ["Google Business Profile", "Local SEO", "Referrals", "Facebook", "Nextdoor"],
    painPoints: ["Unreliable scheduling", "Surprise charges", "Poor workmanship", "Hard to reach"],
    goals: ["Get the job done right", "A provider they can trust", "Fair, clear pricing", "Fast response"],
    services: [
      { title: "Standard Service", description: "Reliable, high-quality work on your schedule." },
      { title: "Emergency Call-Outs", description: "Fast response when you need it most." },
      { title: "Maintenance Plans", description: "Stay ahead of problems with regular care." },
    ],
    contentTopics: ["Before & after projects", "Maintenance tips", "Cost guides", "Customer reviews", "Seasonal checklists"],
    iconHints: ["shield", "grid", "compass"],
  },
];

const GENERIC: IndustryProfile = {
  key: "generic",
  label: "Modern Business",
  keywords: [],
  prefixes: ["The", "Get", "Go", "New", "Bright", "True"],
  suffixes: ["Co", "Studio", "Group", "Labs", "Collective", "HQ"],
  roots: ["Nova", "Vertex", "Beacon", "Atlas", "Lumen", "Apex", "Haven", "Orbit"],
  valueProps: ["Customer-first approach", "Quality you can trust", "Transparent and fair", "Built around your needs", "Reliable results"],
  competitorArchetypes: [
    { name: "Established market leader", descriptor: "Strong brand, slow to innovate" },
    { name: "Budget alternative", descriptor: "Low price, low differentiation" },
    { name: "Emerging challenger", descriptor: "Fresh approach, building trust" },
  ],
  channels: ["Instagram", "Google", "Email", "Referrals", "LinkedIn"],
  painPoints: ["Underwhelming experiences", "Poor communication", "Lack of trust", "Generic, one-size-fits-all options"],
  goals: ["A solution that just works", "A brand they can trust", "Great value", "A delightful experience"],
  services: [
    { title: "Core Offering", description: "Everything you need, thoughtfully delivered." },
    { title: "Premium Tier", description: "Elevated service for those who want more." },
    { title: "Support", description: "We're with you every step of the way." },
  ],
  contentTopics: ["Customer stories", "Behind the scenes", "Tips & guides", "Product highlights", "Team spotlights"],
  iconHints: ["star", "grid", "bolt"],
};

export function detectIndustry(idea: string): IndustryProfile {
  const text = idea.toLowerCase();
  let best: { profile: IndustryProfile; score: number } | null = null;
  for (const profile of PROFILES) {
    let score = 0;
    for (const kw of profile.keywords) {
      if (text.includes(kw)) score += kw.length > 5 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { profile, score };
  }
  return best?.profile ?? GENERIC;
}

export { GENERIC as GENERIC_INDUSTRY };
