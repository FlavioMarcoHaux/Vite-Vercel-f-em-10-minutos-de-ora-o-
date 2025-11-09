import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
    getTrendingTopic,
    generateGuidedPrayer,
    generateShortPrayer,
    generateSpeech,
    generateImageFromPrayer,
    createThumbnailPromptFromPost,
    generateSocialMediaPost,
    generateYouTubeLongPost,
} from '../services/geminiService';
import { SpinnerIcon, BotIcon } from './icons';
import { LanguageContext, LanguageContextType } from '../context';
import { AspectRatio, SocialMediaPost, YouTubeLongPost, MarketingHistoryItem } from '../types';
import { usePersistentState, idb } from '../hooks/usePersistentState';
import { decode, createWavFile } from '../utils/audio';

interface BotAgentProps {
    history: MarketingHistoryItem[];
    setHistory: React.Dispatch<React.SetStateAction<MarketingHistoryItem[]>>;
}

export const BotAgent: React.FC<BotAgentProps> = ({ history, setHistory }) => {
    const { t } = useContext(LanguageContext) as LanguageContextType;
    
    // Autonomous Agent States
    const [isAgentLongActive, setIsAgentLongActive] = usePersistentState<boolean>('agent_isLongActive', false);
    const [isAgentShortActive, setIsAgentShortActive] = usePersistentState<boolean>('agent_isShortActive', false);

    const [longVideoCadence, setLongVideoCadence] = usePersistentState<number>('agent_longVideoCadence', 1);
    const [shortVideoCadence, setShortVideoCadence] = usePersistentState<number>('agent_shortVideoCadence', 3);
    
    const [agentStatusLong, setAgentStatusLong] = useState<string>('');
    const [agentStatusShort, setAgentStatusShort] = useState<string>('');

    const [lastRuns, setLastRuns] = usePersistentState<{ [key: string]: number }>('agent_lastRuns', {});
    const [isAgentBusy, setIsAgentBusy] = useState(false);


    const runAutomatedJob = useCallback(async (jobLang: string, jobType: 'long' | 'short') => {
        setIsAgentBusy(true);
        const typeStr = t(jobType === 'long' ? 'marketingLongVideo' : 'marketingShortVideo');
        const statusUpdater = jobType === 'long' ? setAgentStatusLong : setAgentStatusShort;
        statusUpdater(t('agentStatusRunning').replace('{type}', typeStr).replace('{lang}', jobLang.toUpperCase()));

        try {
            // 1. Research Topic
            const { theme, subthemes } = await getTrendingTopic(jobLang, jobType);

            // 2. Generate Text Assets
            let prayer, post;
            if (jobType === 'long') {
                const [p, ps] = await Promise.all([
                    generateGuidedPrayer(theme, jobLang),
                    generateYouTubeLongPost(theme, subthemes, jobLang)
                ]);
                prayer = p;
                post = ps;
            } else {
                const [p, ps] = await Promise.all([
                    generateShortPrayer(theme, jobLang),
                    generateSocialMediaPost(theme, jobLang)
                ]);
                prayer = p;
                post = ps;
            }
            if (!prayer || !post) throw new Error("Failed to generate text assets.");

            // 3. Generate Media Assets in Parallel
            const visualPrompt = await createThumbnailPromptFromPost(post.title, post.description, prayer, jobLang);
            const aspectRatio: AspectRatio = jobType === 'long' ? '16:9' : '9:16';

            const [audioB64, imageB64] = await Promise.all([
                generateSpeech(prayer, jobType === 'long' ? { speakers: [{ name: 'Roberta Erickson', voice: 'Aoede' }, { name: 'Milton Dilts', voice: 'Enceladus' }] } : undefined),
                generateImageFromPrayer(visualPrompt, aspectRatio, 'imagen-4.0-generate-001')
            ]);

            if (!audioB64 || !imageB64) throw new Error("Failed to generate media assets.");

            const pcmData = decode(audioB64);
            const audioBlob = createWavFile(pcmData, 1, 24000, 16);

            const imageResponse = await fetch(`data:image/png;base64,${imageB64}`);
            const imageBlob = await imageResponse.blob();

            if (!audioBlob || !imageBlob) throw new Error("Failed to create media blobs.");

            // 4. Save to History (if all successful)
            const id = Date.now().toString();
            const audioBlobKey = `history_audio_${id}`;
            const imageBlobKey = `history_image_${id}`;
            await Promise.all([
                idb.set(audioBlobKey, audioBlob),
                idb.set(imageBlobKey, imageBlob),
            ]);

            const newHistoryItem: MarketingHistoryItem = {
                id,
                timestamp: Date.now(),
                type: jobType,
                language: jobLang,
                prompt: theme,
                subthemes: subthemes,
                prayer: prayer,
                socialPost: jobType === 'short' ? post as SocialMediaPost : null,
                longPost: jobType === 'long' ? post as YouTubeLongPost : null,
                audioBlobKey,
                imageBlobKey,
                isDownloaded: false,
            };
            setHistory(prev => [newHistoryItem, ...prev]);

        } catch (error) {
            console.error(`Autonomous agent job failed for ${jobLang}/${jobType}:`, error);
        } finally {
            setIsAgentBusy(false);
        }
    }, [t, setHistory]);

    useEffect(() => {
        const schedules = {
            pt: { long: [6], short: [9, 12, 18] },
            en: { long: [7], short: [9, 12, 18] },
            es: { long: [8], short: [9, 12, 18] },
        };
        const offsets = { pt: 0, en: 20, es: 40 };
        
        const findNextJob = (jobType: 'long' | 'short', cadence: number) => {
            const now = new Date();
            let closestJob = { time: Infinity, details: '' };

            for (let d = 0; d < 2; d++) { // Check today and tomorrow
                const checkDate = new Date(now);
                checkDate.setDate(now.getDate() + d);
                const todayStr = checkDate.toISOString().split('T')[0];

                for (const lang of ['pt', 'en', 'es'] as const) {
                    if (jobType === 'long') {
                        for (let i = 0; i < cadence; i++) {
                            const hour = schedules[lang].long[0];
                            const minute = i * 5;
                            const jobKey = `${todayStr}_${lang}_long_${hour}:${minute}`;
                            const jobTime = new Date(checkDate);
                            jobTime.setHours(hour, minute, 0, 0);

                            if (jobTime.getTime() > now.getTime() && jobTime.getTime() < closestJob.time && !lastRuns[jobKey]) {
                               closestJob = {
                                   time: jobTime.getTime(),
                                   details: t('agentStatusIdle')
                                     .replace('{type}', t('marketingLongVideo'))
                                     .replace('{lang}', lang.toUpperCase())
                                     .replace('{time}', jobTime.toLocaleTimeString(t('appLocaleCode'), { hour: '2-digit', minute: '2-digit' }))
                               };
                            }
                        }
                    } else { // short
                        const shortSchedule = schedules[lang].short.slice(0, cadence);
                        for (const hour of shortSchedule) {
                            const minute = offsets[lang];
                            const jobKey = `${todayStr}_${lang}_short_${hour}:${minute}`;
                            const jobTime = new Date(checkDate);
                            jobTime.setHours(hour, minute, 0, 0);
                            
                            if (jobTime.getTime() > now.getTime() && jobTime.getTime() < closestJob.time && !lastRuns[jobKey]) {
                                closestJob = {
                                    time: jobTime.getTime(),
                                    details: t('agentStatusIdle')
                                      .replace('{type}', t('marketingShortVideo'))
                                      .replace('{lang}', lang.toUpperCase())
                                      .replace('{time}', jobTime.toLocaleTimeString(t('appLocaleCode'), { hour: '2-digit', minute: '2-digit' }))
                               };
                            }
                        }
                    }
                }
                if (closestJob.time !== Infinity) break; 
            }
             return closestJob.details;
        };

        const updateStatuses = () => {
            if (isAgentBusy) return;

            if (isAgentLongActive) {
                const nextJob = findNextJob('long', longVideoCadence);
                setAgentStatusLong(nextJob || t('agentStatusIdle').replace('{type}','...').replace('{lang}','...').replace('{time}','...'));
            } else {
                setAgentStatusLong(t('agentStatusDisabled'));
            }

            if (isAgentShortActive) {
                 const nextJob = findNextJob('short', shortVideoCadence);
                setAgentStatusShort(nextJob || t('agentStatusIdle').replace('{type}','...').replace('{lang}','...').replace('{time}','...'));
            } else {
                setAgentStatusShort(t('agentStatusDisabled'));
            }
        };

        const checkSchedule = () => {
            if (isAgentBusy) return;

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            
            // Check Long Videos
            if (isAgentLongActive) {
                for (const lang of ['pt', 'en', 'es'] as const) {
                    for (let i = 0; i < longVideoCadence; i++) {
                        const hour = schedules[lang].long[0];
                        const minute = i * 5; // Stagger generations by 5 mins
                        const jobKey = `${todayStr}_${lang}_long_${hour}:${minute}`;
                        if (currentHour === hour && currentMinute === minute && !lastRuns[jobKey]) {
                            setLastRuns(prev => ({ ...prev, [jobKey]: Date.now() }));
                            runAutomatedJob(lang, 'long');
                            return; // Run one job at a time
                        }
                    }
                }
            }
            
            // Check Short Videos
            if (isAgentShortActive) {
                for (const lang of ['pt', 'en', 'es'] as const) {
                    const shortSchedule = schedules[lang].short.slice(0, shortVideoCadence);
                    for (const hour of shortSchedule) {
                        const minute = offsets[lang];
                        const jobKey = `${todayStr}_${lang}_short_${hour}:${minute}`;
                        if (currentHour === hour && currentMinute === minute && !lastRuns[jobKey]) {
                            setLastRuns(prev => ({ ...prev, [jobKey]: Date.now() }));
                            runAutomatedJob(lang, 'short');
                            return; // Run one job at a time
                        }
                    }
                }
            }
        };

        updateStatuses();
        const statusInterval = window.setInterval(updateStatuses, 60000);

        let jobIntervalId: number | undefined;
        let startupTimeoutId: number | undefined;

        if (isAgentLongActive || isAgentShortActive) {
            // Delay the first check and the interval setup to avoid a burst of API calls on load.
            startupTimeoutId = setTimeout(() => {
                checkSchedule(); // first check
                jobIntervalId = window.setInterval(checkSchedule, 30000);
            }, 10000); // 10 second delay
        }

        return () => {
            clearInterval(statusInterval);
            if (startupTimeoutId) clearTimeout(startupTimeoutId);
            if (jobIntervalId) clearInterval(jobIntervalId);
        };
    }, [isAgentLongActive, isAgentShortActive, isAgentBusy, longVideoCadence, shortVideoCadence, lastRuns, setLastRuns, runAutomatedJob, t]);

    const AgentPanel = ({
        type,
        isActive,
        setIsActive,
        cadence,
        setCadence,
        status
    }: {
        type: 'long' | 'short';
        isActive: boolean;
        setIsActive: (val: boolean) => void;
        cadence: number;
        setCadence: (val: number) => void;
        status: string;
    }) => (
         <div className="p-4 bg-gray-900 border border-teal-700 rounded-lg space-y-4 flex flex-col">
            <div className="flex items-start gap-3">
                <BotIcon className="h-6 w-6 text-teal-400 flex-shrink-0 mt-1" />
                <div>
                    <h2 className="text-lg font-bold text-teal-300">{t(type === 'long' ? 'agentTitleLong' : 'agentTitleShort')}</h2>
                    <p className="text-xs text-gray-400">{t(type === 'long' ? 'agentDescriptionLong' : 'agentDescriptionShort')}</p>
                </div>
            </div>
            <div className="flex-grow space-y-3 p-3 bg-gray-800 rounded-lg flex flex-col justify-between">
                <div className="flex items-center gap-3">
                    <label className="font-bold text-gray-300 text-sm">{t('agentStatus')}</label>
                    <label className="flex items-center cursor-pointer">
                        <input type="checkbox" id={`agent-toggle-${type}`} className="sr-only peer" checked={isActive} onChange={() => setIsActive(!isActive)} />
                        <div className="relative w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                        <span className={`ms-3 text-sm font-medium ${isActive ? 'text-teal-400' : 'text-gray-400'}`}>
                            {isActive ? t('agentStatusActive') : t('agentStatusInactive')}
                        </span>
                    </label>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-300 whitespace-nowrap">{t(type === 'long' ? 'agentCadenceLabel' : 'agentCadenceLabelShort')}:</label>
                    <select
                        value={cadence}
                        onChange={(e) => setCadence(Number(e.target.value))}
                        disabled={!isActive}
                        className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm disabled:opacity-50"
                    >
                        {type === 'long' ? (
                            <>
                                <option value={1}>{t('agentCadence1')}</option>
                                <option value={2}>{t('agentCadence2')}</option>
                                <option value={3}>{t('agentCadence3')}</option>
                            </>
                        ) : (
                             <>
                                <option value={3}>{t('agentCadenceShort3')}</option>
                                <option value={2}>{t('agentCadenceShort2')}</option>
                                <option value={1}>{t('agentCadenceShort1')}</option>
                                <option value={0}>{t('agentCadenceShort0')}</option>
                            </>
                        )}
                    </select>
                </div>
                 <div className="text-xs text-gray-400 italic text-center h-8 flex items-center justify-center">
                    {isAgentBusy && status.startsWith('Running') ? <SpinnerIcon className="inline-flex w-4 h-4 mr-2" /> : null}
                    {status}
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg animate-fade-in space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AgentPanel 
                    type="long"
                    isActive={isAgentLongActive}
                    setIsActive={setIsAgentLongActive}
                    cadence={longVideoCadence}
                    setCadence={setLongVideoCadence}
                    status={agentStatusLong}
                />
                <AgentPanel 
                    type="short"
                    isActive={isAgentShortActive}
                    setIsActive={setIsAgentShortActive}
                    cadence={shortVideoCadence}
                    setCadence={setShortVideoCadence}
                    status={agentStatusShort}
                />
            </div>
            <p className="text-center text-xs text-gray-500">{t('agentKeepTabOpen')}</p>
        </div>
    );
};