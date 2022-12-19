import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setGlobalState } from '../../../actions/globalActions';
import Axios from 'axios';
import { axiosConfig } from '../../../common/helpers';
import {
    getUpdatedUserParties,
    getUpdatedUserItems
} from '../../../common/requests';
import { useTranslation } from 'react-i18next';

import AddMediaTabBar from '../AddMediaTabBar/AddMediaTabBar';
import AddMediaTabUser from '../AddMediaTabUser/AddMediaTabUser';
import AddMediaTabWeb from '../AddMediaTabWeb/AddMediaTabWeb';
import AddMediaUploadProgress from '../AddMediaUploadProgress/AddMediaUploadProgress';
import Button from '../../input/Button/Button';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faThumbsUp } from '@fortawesome/free-regular-svg-icons';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import AddMediaTabFile from '../AddMediaTabFile/AddMediaTabFile';
import { Socket } from 'socket.io-client';
import {
    ClientParty,
    MediaItem,
    NewMediaItem,
    RootAppState
} from '../../../../../shared/types';

type Props = {
    isActive: boolean;
    partyItemsSet: Set<string>;
    setAddMediaIsActive: (isActive: boolean) => void;
    socket: Socket | null;
    setPlayerFocused: (focused: boolean) => void;
    handleItemEditSave: (mediaItem: MediaItem) => Promise<void>;
};

export default function AddMedia({
    isActive,
    partyItemsSet,
    setAddMediaIsActive,
    socket,
    setPlayerFocused,
    handleItemEditSave
}: Props): JSX.Element {
    const { t } = useTranslation();

    const user = useSelector((state: RootAppState) => state.globalState.user);
    const party = useSelector((state: RootAppState) => state.globalState.party);
    const userItems = useSelector(
        (state: RootAppState) => state.globalState.userItems
    );

    const mediaItemDefault: NewMediaItem = {
        name: '',
        type: 'file',
        owner: user ? user.id : null,
        url: ''
    };

    const [activeTab, setActiveTab] = useState<'user' | 'web' | 'file'>('file');
    const [file, setFile] = useState<File | null>(null);
    const [mediaItem, setMediaItem] = useState(mediaItemDefault);
    const [uploadStartTime, setUploadStartTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [addedSuccessfully, setAddedSuccessfully] = useState(false);
    const [lastCreatedItem, setLastCreatedItem] = useState<NewMediaItem>();
    const [uploadError, setUploadError] = useState(false);
    const [fetchingLinkMetadata, setFetchingLinkMetadata] = useState(false);
    const [linkMetadata, setLinkMetadata] = useState<{
        videoTitle: string;
        channelTitle: string;
    } | null>(null);

    const dispatch = useDispatch();

    // Preselect user tab if there are items to add
    useEffect(() => {
        if (userItems && party)
            if (
                userItems.filter(
                    (userItem: MediaItem) => !partyItemsSet.has(userItem.id)
                ).length
            ) {
                setActiveTab('user');
            }
    }, [userItems, party, partyItemsSet]);

    const addUserItem = async (item: MediaItem): Promise<void> => {
        if (party) {
            try {
                const response = await Axios.post(
                    '/api/partyItems',
                    { mediaItem: item, partyId: party.id },
                    axiosConfig()
                );

                if (response.data.success === true) {
                    updatePartyAndUserParties();
                } else {
                    dispatch(
                        setGlobalState({
                            errorMessage: t(
                                `apiResponseMessages.${response.data.msg}`
                            )
                        })
                    );
                }
            } catch (error) {
                dispatch(
                    setGlobalState({
                        errorMessage: t(`errors.addToPartyError`)
                    })
                );
            }
        }
    };

    const addWebItem = async (event: React.MouseEvent): Promise<void> => {
        event.preventDefault();

        if (party) {
            try {
                const response = await Axios.post(
                    '/api/mediaItem',
                    { mediaItem: mediaItem, partyId: party.id },
                    axiosConfig()
                );

                if (response.data.success === true) {
                    updatePartyAndUserParties();
                    getUpdatedUserItems(dispatch, t);
                    resetUploadForm();
                    setIsUploading(false);
                    setLastCreatedItem(mediaItem);
                    setAddedSuccessfully(true);
                    hideFinishInAFewSecs();
                    toggleCollapseAddMediaMenu();
                } else {
                    dispatch(
                        setGlobalState({
                            errorMessage: t(
                                `apiResponseMessages.${response.data.msg}`
                            )
                        })
                    );
                }
            } catch (error) {
                dispatch(
                    setGlobalState({
                        errorMessage: t(`errors.addItemError`)
                    })
                );
            }
        }
    };

    const addFileItem = async (event: React.MouseEvent): Promise<void> => {
        event.preventDefault();

        if (party && file && mediaItem.owner) {
            const formData = new FormData();
            formData.append('owner', mediaItem.owner);
            formData.append('name', mediaItem.name);
            formData.append('file', file);
            formData.append('partyId', party.id);
            setIsUploading(true);
            setAddedSuccessfully(false);
            setUploadStartTime(Date.now());
            try {
                const response = await Axios.post('/api/file', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    },
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted =
                            progressEvent.total !== undefined
                                ? Math.round(
                                      (progressEvent.loaded * 100) /
                                          progressEvent.total
                                  )
                                : 0;
                        setProgress(percentCompleted);
                    },
                    withCredentials: true
                });

                if (response.data.success === true) {
                    updatePartyAndUserParties();
                    getUpdatedUserItems(dispatch, t);
                    resetUploadForm();
                    setLastCreatedItem(mediaItem);
                    setIsUploading(false);
                    setAddedSuccessfully(true);
                    hideFinishInAFewSecs();
                    toggleCollapseAddMediaMenu();
                } else {
                    dispatch(
                        setGlobalState({
                            errorMessage: t(
                                `apiResponseMessages.${response.data.msg}`
                            )
                        })
                    );
                }
            } catch (error) {
                dispatch(
                    setGlobalState({
                        errorMessage: t(`errors.uploadError`)
                    })
                );

                resetUploadForm();
                setIsUploading(false);
                setUploadError(true);
            }
        }
    };

    const updatePartyAndUserParties = async (): Promise<void> => {
        if (socket && party && userItems) {
            // Update userParties
            const updatedUserParties = await getUpdatedUserParties(dispatch, t);

            const updatedParty = updatedUserParties.find(
                (userParty: ClientParty) => userParty.id === party.id
            );

            // Preselect file tab if there are no items left to add
            if (
                updatedParty &&
                !userItems.filter(
                    (userItem: MediaItem) =>
                        !updatedParty.items.find(
                            (item: MediaItem) => item.id === userItem.id
                        )
                ).length
            ) {
                setActiveTab('file');
            }

            // Update current party
            dispatch(
                setGlobalState({
                    party: updatedParty
                })
            );

            // Ask other users to update their userParties
            socket.emit('partyUpdate', { partyId: party.id });
        }
    };

    const handleLinkInput = async (
        event: React.ChangeEvent<HTMLInputElement>
    ): Promise<void> => {
        let url = event.target.value;

        // YT: Remove list-related URL params
        if (
            url.indexOf('https://www.youtube.com') === 0 &&
            url.indexOf('&list=') > -1
        ) {
            url = url.slice(0, url.indexOf('&list='));
        }

        const webMediaItem: NewMediaItem = {
            ...mediaItem,
            url: url,
            type: 'web'
        };

        setMediaItem(webMediaItem);

        if (url.indexOf('https://www.youtube.com') === 0) {
            setFetchingLinkMetadata(true);

            try {
                const response = await Axios.post(
                    '/api/linkMetadata',
                    { url: url },
                    { ...axiosConfig(), timeout: 3000 }
                );

                setLinkMetadata({
                    videoTitle: response.data.videoTitle,
                    channelTitle: response.data.channelTitle
                });

                setMediaItem({
                    ...webMediaItem,
                    name: response.data.videoTitle
                });

                setFetchingLinkMetadata(false);
            } catch (error) {
                setMediaItem({ ...webMediaItem, name: '' });
                setFetchingLinkMetadata(false);
            }
        }
    };

    const toggleCollapseAddMediaMenu = (): void => {
        if (isActive) {
            setActiveTab('file');
        }
        setAddMediaIsActive(!isActive);
        setUploadError(false);
        resetUploadForm();
    };

    const changeTab = (tab: 'user' | 'web' | 'file'): void => {
        setActiveTab(tab);
        setFile(null);
        setMediaItem(mediaItemDefault);
        setUploadError(false);
    };

    const resetUploadForm = (): void => {
        setFile(null);
        setMediaItem(mediaItemDefault);
    };

    const hideFinishInAFewSecs = (): void => {
        setTimeout(() => {
            setAddedSuccessfully(false);
        }, 5000);
    };

    return (
        <div
            className={'mt-2' + (!isActive ? '' : ' flex flex-col flex-shrink')}
        >
            {isActive && (
                <>
                    <AddMediaTabBar
                        activeTab={activeTab}
                        changeTab={changeTab}
                        isUploading={isUploading}
                        toggleCollapseAddMediaMenu={toggleCollapseAddMediaMenu}
                    ></AddMediaTabBar>
                    <div className="flex flex-col">
                        {!isUploading && !uploadError && userItems && party ? (
                            <>
                                {activeTab === 'user' && (
                                    <AddMediaTabUser
                                        partyItemsSet={partyItemsSet}
                                        addUserItem={addUserItem}
                                        setPlayerFocused={(
                                            focused: boolean
                                        ): void => setPlayerFocused(focused)}
                                        handleItemEditSave={handleItemEditSave}
                                    ></AddMediaTabUser>
                                )}
                                {activeTab === 'web' && (
                                    <AddMediaTabWeb
                                        mediaItem={mediaItem}
                                        setMediaItem={(
                                            mediaItem: NewMediaItem
                                        ): void => setMediaItem(mediaItem)}
                                        addWebItem={addWebItem}
                                        handleLinkInput={handleLinkInput}
                                        setPlayerFocused={(
                                            focused: boolean
                                        ): void => setPlayerFocused(focused)}
                                        linkMetadata={linkMetadata}
                                        fetchingLinkMetadata={
                                            fetchingLinkMetadata
                                        }
                                    ></AddMediaTabWeb>
                                )}
                                {activeTab === 'file' && (
                                    <AddMediaTabFile
                                        file={file}
                                        setFile={(file: File): void =>
                                            setFile(file)
                                        }
                                        mediaItem={mediaItem}
                                        setMediaItem={(
                                            mediaItem: NewMediaItem
                                        ): void => setMediaItem(mediaItem)}
                                        addFileItem={addFileItem}
                                        resetUploadForm={resetUploadForm}
                                        setPlayerFocused={(
                                            focused: boolean
                                        ): void => setPlayerFocused(focused)}
                                    ></AddMediaTabFile>
                                )}
                            </>
                        ) : !uploadError ? (
                            <AddMediaUploadProgress
                                progress={progress}
                                uploadStartTime={uploadStartTime}
                            ></AddMediaUploadProgress>
                        ) : (
                            <div className="my-3">
                                {t('mediaMenu.uploadError')}
                            </div>
                        )}
                    </div>
                </>
            )}

            {!isActive && (
                <>
                    <Button
                        padding="p-1"
                        title={t('mediaMenu.addMediaTitle')}
                        text={
                            <>
                                <FontAwesomeIcon
                                    icon={faPlus}
                                ></FontAwesomeIcon>
                                <span>{' ' + t('mediaMenu.addMedia')}</span>
                            </>
                        }
                        onClick={toggleCollapseAddMediaMenu}
                    ></Button>
                    {addedSuccessfully && lastCreatedItem && (
                        <div className="my-3 breakLongWords">
                            <FontAwesomeIcon
                                className="text-purple-400"
                                icon={faThumbsUp}
                            ></FontAwesomeIcon>{' '}
                            {lastCreatedItem.type === 'file'
                                ? t('mediaMenu.uploadFinished')
                                : t('mediaMenu.addingFinished')}
                            {lastCreatedItem.name}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
