import { useState } from 'react';
import { BellRing, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useApp } from '../../../../context';
import type { UpdateCheckPayload } from '../../../../core/types';
import { APP_VERSION } from '../../../../core/appInfo';
import { openExternalUrl } from '../../../../core/jcef';
import { commandErrorMessage } from '../../../../core/errorMessage';
import { Switch } from '../../../ui/switch';
import { Button } from '../../../ui/button';
import { SettingRow } from './SettingRow';

const RELEASES_PAGE = 'https://github.com/alegarciasanchez7/tfg-gensynth/releases';

/**
 * About & updates: the installed version, the startup check preference and a manual check.
 * Nothing is installed unless the user clicks Update now and confirms.
 */
export function UpdatesSettingsSection() {
  const { state, actions } = useApp();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDesktop = state.connectionMode === 'jcef';
  const update = state.availableUpdate;

  const checkNow = async () => {
    setChecking(true);
    setError(null);
    try {
      setResult(await actions.checkForUpdates({ silent: false }));
    } catch (checkError) {
      setResult(null);
      setError(commandErrorMessage(checkError, 'Could not check for updates'));
    } finally {
      setChecking(false);
    }
  };

  let resultText: string | null = null;
  if (error) {
    resultText = error;
  } else if (result && !result.supported) {
    resultText = result.reason ?? 'Updates are not available here.';
  } else if (result && !result.available) {
    resultText = 'You have the latest version.';
  }

  const buttonClass = 'h-7 px-2 text-[11px]';
  const mono = { fontFamily: 'JetBrains Mono, monospace' };

  return (
    <div className="flex flex-col gap-2">
      <SettingRow
        icon={<RefreshCw size={12} className="text-cyan-400" />}
        title={`GenSynth ${APP_VERSION}`}
        description="Installed version. Updates come from the GenSynth releases on GitHub."
      >
        <Button type="button" variant="outline" size="sm" className={buttonClass}
          disabled={checking || !isDesktop} onClick={() => void checkNow()}>
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} /> {checking ? 'Checking...' : 'Check now'}
        </Button>
      </SettingRow>

      {!isDesktop && (
        <span className="text-[10px] text-amber-400 px-1" style={mono}>
          Only in the installed desktop app. Download new versions from the{' '}
          <button type="button" className="underline [font:inherit]" onClick={() => void openExternalUrl(RELEASES_PAGE)}>Releases page</button>.
        </span>
      )}
      {resultText && (
        <span className={`text-[10px] px-1 ${error ? 'text-red-400' : 'text-[var(--c-tx3)]'}`} style={mono}>
          {resultText}
        </span>
      )}

      {update && (
        <SettingRow
          icon={<Download size={12} className="text-cyan-400" />}
          title={`GenSynth ${update.latestVersion} is available`}
          description="You decide when to update: until then you keep the installed version."
        >
          <div className="flex gap-1.5">
            {update.releaseUrl && (
              <Button type="button" variant="outline" size="sm" className={buttonClass}
                onClick={() => void openExternalUrl(update.releaseUrl)}>
                <ExternalLink size={12} /> Release notes
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className={buttonClass}
              onClick={() => void actions.installUpdate(update.latestVersion)}>
              <Download size={12} /> Update now
            </Button>
          </div>
        </SettingRow>
      )}

      <SettingRow
        icon={<BellRing size={12} className="text-cyan-400" />}
        title="Check for updates at startup"
        description="Shows a notice when a new version is published. It never installs by itself."
        htmlFor="settings-check-updates"
      >
        <Switch
          id="settings-check-updates"
          aria-label="Check for updates at startup"
          checked={state.checkUpdatesAtStartup}
          onCheckedChange={(checked) => actions.setCheckUpdatesAtStartup(checked)}
          className="data-[state=checked]:bg-cyan-500"
        />
      </SettingRow>
    </div>
  );
}
