import en from './i18n/en.json';
import de from './i18n/de.json';
import ru from './i18n/ru.json';

// prefix: true -> VIS-2 prefixes every key with "<adapter name>_" (vis-2-widgets-zuhause_), see getI18nPrefix().
// en, de AND ru must be present: I18n.extendTranslations() only then reads this as one dictionary per language.
const translations = { en, de, ru, prefix: true };

export default translations;
