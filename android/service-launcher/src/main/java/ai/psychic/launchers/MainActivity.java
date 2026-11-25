package ai.psychic.launchers;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.browser.customtabs.CustomTabsIntent;

/** Opens the provider's official site in the user's browser, never in our WebView. */
public final class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri service = Uri.parse(BuildConfig.SERVICE_URL);
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, service);
            finish();
        } catch (ActivityNotFoundException e) {
            // A browser without Custom Tabs may still support a normal HTTPS intent.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, service).addCategory(Intent.CATEGORY_BROWSABLE));
                finish();
            } catch (ActivityNotFoundException noBrowser) {
                new AlertDialog.Builder(this)
                    .setTitle(BuildConfig.SERVICE_NAME)
                    .setMessage("Не найден браузер. Установите или включите браузер и попробуйте снова.")
                    .setPositiveButton("Закрыть", (dialog, which) -> finish())
                    .setOnCancelListener(dialog -> finish())
                    .show();
            }
        }
    }
}
