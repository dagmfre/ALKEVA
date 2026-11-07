import type { Locale } from "@alkeva/shared";

/**
 * The bot's own words (Phase 11). Plain text only — messages are sent with no
 * parse_mode. Amharic and English by the developer; Tigrinya, Afaan Oromoo and
 * Somali are developer-drafted and need a native speaker's review before
 * launch, the same rule the UI strings follow.
 *
 * The bot never states a balance or a holding in chat: a chat history is not
 * an access-controlled screen (shared phones, forwarded messages, backups).
 */
export interface BotCopy {
  open: string;
  welcomeLinked: string;
  welcomeNew: string;
  help: string;
  priceHeader: string;
  priceLine: (metal: "gold" | "platinum", etbPerGram: string) => string;
  priceStale: string;
  priceUnavailable: string;
  unlinked: string;
  notLinked: string;
  /** setMyCommands descriptions */
  cmdStart: string;
  cmdPrice: string;
  cmdHelp: string;
  cmdUnlink: string;
  /** setMyShortDescription (≤120) and setMyDescription (≤512) */
  shortDescription: string;
  description: string;
}

const en: BotCopy = {
  open: "Open ALKEVA",
  welcomeLinked:
    "Welcome back to ALKEVA. Tap the button to open your account inside Telegram. Notices about your orders, deposits and price alerts arrive here.",
  welcomeNew:
    "ALKEVA lets you buy and hold real gold and platinum, priced live in birr. Tap the button to open the app and create an account or connect the one you have.",
  help:
    "Commands:\n/price — live gold and platinum price per gram\n/unlink — disconnect this Telegram account from ALKEVA\n/help — this list\n\nALKEVA will never ask for your password or a code in this chat.",
  priceHeader: "Live price per gram:",
  priceLine: (m, v) => `${m === "gold" ? "Gold" : "Platinum"}: ETB ${v}`,
  priceStale: "The feed is delayed — this is the last confirmed price.",
  priceUnavailable: "The price is not available right now. Please try again shortly.",
  unlinked:
    "This Telegram account is disconnected from ALKEVA, and every session opened through Telegram was signed out. We emailed the account owner.",
  notLinked: "This Telegram account is not connected to an ALKEVA account.",
  cmdStart: "Open ALKEVA",
  cmdPrice: "Live gold and platinum price",
  cmdHelp: "What this bot can do",
  cmdUnlink: "Disconnect Telegram from ALKEVA",
  shortDescription: "Buy and hold real gold and platinum, priced live in birr.",
  description:
    "ALKEVA is a gold and platinum dealer for Ethiopia. Open the app to buy, sell and hold metal stored in the vault, with every price live in birr and every trade on a receipt. The bot sends notices about your account. It never asks for passwords or codes.",
};

const am: BotCopy = {
  open: "ALKEVAን ክፈት",
  welcomeLinked:
    "እንኳን ወደ ALKEVA በደህና ተመለሱ። መለያዎን በቴሌግራም ውስጥ ለመክፈት አዝራሩን ይጫኑ። ስለ ትዕዛዞችዎ፣ ገቢዎችዎ እና የዋጋ ማንቂያዎች መልእክቶች እዚህ ይደርሳሉ።",
  welcomeNew:
    "ALKEVA እውነተኛ ወርቅ እና ፕላቲነም በቀጥታ የብር ዋጋ እንዲገዙ እና እንዲይዙ ያስችልዎታል። መተግበሪያውን ለመክፈት እና መለያ ለመፍጠር ወይም ያለዎትን ለማገናኘት አዝራሩን ይጫኑ።",
  help:
    "ትዕዛዞች፦\n/price — የወርቅ እና የፕላቲነም ቀጥታ ዋጋ በግራም\n/unlink — ይህን የቴሌግራም መለያ ከALKEVA ያላቅቁ\n/help — ይህ ዝርዝር\n\nALKEVA በዚህ ውይይት የይለፍ ቃልዎን ወይም ኮድ በጭራሽ አይጠይቅም።",
  priceHeader: "ቀጥታ ዋጋ በግራም፦",
  priceLine: (m, v) => `${m === "gold" ? "ወርቅ" : "ፕላቲነም"}፦ ብር ${v}`,
  priceStale: "የዋጋ ምንጩ ዘግይቷል — ይህ የመጨረሻው የተረጋገጠ ዋጋ ነው።",
  priceUnavailable: "ዋጋው አሁን አይገኝም። እባክዎ ትንሽ ቆይተው ይሞክሩ።",
  unlinked:
    "ይህ የቴሌግራም መለያ ከALKEVA ተላቅቋል፤ በቴሌግራም የተከፈቱ ክፍለ-ጊዜዎች በሙሉ ተዘግተዋል። ለመለያው ባለቤት ኢሜይል ልከናል።",
  notLinked: "ይህ የቴሌግራም መለያ ከALKEVA መለያ ጋር አልተገናኘም።",
  cmdStart: "ALKEVAን ክፈት",
  cmdPrice: "የወርቅ እና የፕላቲነም ቀጥታ ዋጋ",
  cmdHelp: "ይህ ቦት ምን ይሰራል",
  cmdUnlink: "ቴሌግራምን ከALKEVA ያላቅቁ",
  shortDescription: "እውነተኛ ወርቅ እና ፕላቲነም በቀጥታ የብር ዋጋ ይግዙ እና ይያዙ።",
  description:
    "ALKEVA ለኢትዮጵያ የወርቅ እና የፕላቲነም አከፋፋይ ነው። በካዝና የተቀመጠ ብረት ለመግዛት፣ ለመሸጥ እና ለመያዝ መተግበሪያውን ይክፈቱ — እያንዳንዱ ዋጋ በብር በቀጥታ፣ እያንዳንዱ ግብይት በደረሰኝ። ቦቱ ስለ መለያዎ መልእክቶችን ይልካል፤ የይለፍ ቃል ወይም ኮድ በጭራሽ አይጠይቅም።",
};

const ti: BotCopy = {
  open: "ALKEVA ክፈት",
  welcomeLinked:
    "እንቋዕ ናብ ALKEVA ብደሓን ተመለስኩም። ሕሳብኩም ኣብ ውሽጢ ቴሌግራም ንምኽፋት ነቲ መልጎም ጠውቑ። ብዛዕባ ትእዛዛትኩም፣ ኣታዊታትኩምን መጠንቀቕታ ዋጋን ዝምልከቱ መልእኽትታት ኣብዚ ይመጹ።",
  welcomeNew:
    "ALKEVA ሓቀኛ ወርቅን ፕላቲነምን ብቐጥታ ናይ ብር ዋጋ ክትገዝኡን ክትሕዙን የኽእለኩም። ነቲ መተግበሪ ንምኽፋትን ሕሳብ ንምፍጣር ወይ ዘለኩም ንምትእስሳርን ነቲ መልጎም ጠውቑ።",
  help:
    "ትእዛዛት፦\n/price — ቀጥታ ዋጋ ወርቅን ፕላቲነምን ብግራም\n/unlink — ነዚ ሕሳብ ቴሌግራም ካብ ALKEVA ፍለዩ\n/help — እዚ ዝርዝር\n\nALKEVA ኣብዚ ዕላል ቃል-ምሕላፍኩም ወይ ኮድ ፈጺሙ ኣይሓትትን።",
  priceHeader: "ቀጥታ ዋጋ ብግራም፦",
  priceLine: (m, v) => `${m === "gold" ? "ወርቅ" : "ፕላቲነም"}፦ ብር ${v}`,
  priceStale: "ምንጪ ዋጋ ደንጒዩ ኣሎ — እዚ እቲ ናይ መወዳእታ ዝተረጋገጸ ዋጋ እዩ።",
  priceUnavailable: "ዋጋ ሕጂ ኣይርከብን። በጃኹም ድሕሪ ቁሩብ ደጊምኩም ፈትኑ።",
  unlinked:
    "እዚ ሕሳብ ቴሌግራም ካብ ALKEVA ተፈልዩ፤ ብቴሌግራም ዝተኸፍቱ ክፍለ-ግዜታት ኩሎም ተዓጽዮም። ንዋና ሕሳብ ኢመይል ሰዲድና።",
  notLinked: "እዚ ሕሳብ ቴሌግራም ምስ ሕሳብ ALKEVA ኣይተኣሳሰረን።",
  cmdStart: "ALKEVA ክፈት",
  cmdPrice: "ቀጥታ ዋጋ ወርቅን ፕላቲነምን",
  cmdHelp: "እዚ ቦት እንታይ ይገብር",
  cmdUnlink: "ቴሌግራም ካብ ALKEVA ፍለዩ",
  shortDescription: "ሓቀኛ ወርቅን ፕላቲነምን ብቐጥታ ናይ ብር ዋጋ ግዝኡን ሓዙን።",
  description:
    "ALKEVA ንኢትዮጵያ ናይ ወርቅን ፕላቲነምን ኣከፋፋሊ እዩ። ኣብ ካዝና ዝተቐመጠ ብረት ንምግዛእ፣ ንምሻጥን ንምሓዝን ነቲ መተግበሪ ክፈቱ — ነፍሲ ወከፍ ዋጋ ብብር ብቐጥታ፣ ነፍሲ ወከፍ ግብይት ብደረሰኝ። እቲ ቦት ብዛዕባ ሕሳብኩም መልእኽትታት ይሰድድ፤ ቃል-ምሕላፍ ወይ ኮድ ፈጺሙ ኣይሓትትን።",
};

const om: BotCopy = {
  open: "ALKEVA banuu",
  welcomeLinked:
    "Gara ALKEVA nagaan deebitan. Herrega keessan Telegram keessatti banuuf qabduu tuqaa. Beeksisni ajajawwan, galii fi akeekkachiisa gatii keessanii as dhufa.",
  welcomeNew:
    "ALKEVA warqee fi pilaatinamii dhugaa gatii qarshii kallattiin akka bitattanii qabattan isin dandeessisa. Appii banuu fi herrega uumuuf ykn kan qabdan walqabsiisuuf qabduu tuqaa.",
  help:
    "Ajajawwan:\n/price — gatii warqee fi pilaatinamii kallattii giraamiin\n/unlink — herrega Telegram kana ALKEVA irraa adda baasi\n/help — tarree kana\n\nALKEVA marii kana keessatti jecha darbii ykn koodii keessan gonkumaa hin gaafatu.",
  priceHeader: "Gatii kallattii giraamiin:",
  priceLine: (m, v) => `${m === "gold" ? "Warqee" : "Pilaatinamii"}: ETB ${v}`,
  priceStale: "Maddi gatii tursiifameera — kun gatii mirkanaa'e isa dhumaati.",
  priceUnavailable: "Gatiin amma hin argamu. Maaloo yeroo muraasa booda irra deebi'aa yaali.",
  unlinked:
    "Herregni Telegram kun ALKEVA irraa adda ba'eera, sesiiniin Telegram'n banaman hundi cufamaniiru. Abbaa herregaatiif imeelii ergineerra.",
  notLinked: "Herregni Telegram kun herrega ALKEVA wajjin hin walqabatne.",
  cmdStart: "ALKEVA banuu",
  cmdPrice: "Gatii warqee fi pilaatinamii kallattii",
  cmdHelp: "Boottiin kun maal hojjeta",
  cmdUnlink: "Telegram ALKEVA irraa adda baasi",
  shortDescription: "Warqee fi pilaatinamii dhugaa gatii qarshii kallattiin bitadhaa qabadhaa.",
  description:
    "ALKEVA Itoophiyaaf daldalaa warqee fi pilaatinamiiti. Sibiila kuusaa keessa jiru bituu, gurguruu fi qabachuuf appii banaa — gatiin hundi qarshiin kallattii, daldalli hundi nagahee waliin. Boottiin waa'ee herrega keessanii beeksisa erga; jecha darbii ykn koodii gonkumaa hin gaafatu.",
};

const so: BotCopy = {
  open: "Fur ALKEVA",
  welcomeLinked:
    "Ku soo dhowow ALKEVA mar kale. Taabo badhanka si aad xisaabtaada uga furto Telegram gudihiisa. Ogeysiisyada dalabyadaada, dhigashadaada iyo digniinaha qiimaha halkan ayay ku imanayaan.",
  welcomeNew:
    "ALKEVA waxay kuu oggolaanaysaa inaad iibsato oo haysato dahab iyo platinum dhab ah, oo qiimahoodu yahay birr toos ah. Taabo badhanka si aad u furto app-ka oo aad u abuurto xisaab ama ugu xidho tan aad haysato.",
  help:
    "Amarrada:\n/price — qiimaha tooska ah ee dahabka iyo platinum-ka garaamkiiba\n/unlink — ka jar xisaabtan Telegram ALKEVA\n/help — liiskan\n\nALKEVA weligeed kuuma weydiin doonto furahaaga sirta ah ama koodh wadahadalkan dhexdiisa.",
  priceHeader: "Qiimaha tooska ah garaamkiiba:",
  priceLine: (m, v) => `${m === "gold" ? "Dahab" : "Platinum"}: ETB ${v}`,
  priceStale: "Ilaha qiimuhu waa daahay — kani waa qiimihii ugu dambeeyay ee la xaqiijiyay.",
  priceUnavailable: "Qiimuhu hadda lama heli karo. Fadlan isku day mar kale wax yar kadib.",
  unlinked:
    "Xisaabtan Telegram waa laga jaray ALKEVA, dhammaan fadhiyadii Telegram lagu furayna waa la xidhay. Waxaan iimayl u dirnay milkiilaha xisaabta.",
  notLinked: "Xisaabtan Telegram kuma xidhna xisaab ALKEVA.",
  cmdStart: "Fur ALKEVA",
  cmdPrice: "Qiimaha tooska ah ee dahabka iyo platinum-ka",
  cmdHelp: "Waxa bot-kani qabto",
  cmdUnlink: "Ka jar Telegram ALKEVA",
  shortDescription: "Iibso oo hayso dahab iyo platinum dhab ah, qiimo birr toos ah.",
  description:
    "ALKEVA waa ganacsade dahab iyo platinum oo Itoobiya u adeega. Fur app-ka si aad u iibsato, u iibiso oo u haysato bir ku kaydsan khasnadda — qiime kasta waa birr toos ah, ganacsi kastana wuxuu leeyahay rasiid. Bot-ku wuxuu soo diraa ogeysiisyo ku saabsan xisaabtaada; weligiis ma weydiiyo furayaal sir ah ama koodh.",
};

export const BOT_COPY: Record<Locale, BotCopy> = { en, am, ti, om, so };
