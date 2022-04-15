import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { insertNewMediaItem } from '../database/generalOperations.js';
import { Request, Response } from 'express';
import { Logger } from 'winston';
import helpers from '../../shared/helpers.js';
import { Models } from '../../shared/types.js';
import {
    multerFileValidator,
    newFileMediaItemValidator
} from '../../shared/validation.js';

// HELPERS

// Create multer instance for uploading files
const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        const uploadPath = path.resolve('data/uploads');
        callback(null, uploadPath);
    },
    filename: (req: Request, file, callback) => {
        const newFileId = uuid();
        callback(null, `${newFileId}-${file.originalname}`);
        req.newFileId = newFileId;
    }
});

const uploadFile = multer({
    storage,
    limits: { fileSize: 3000000000 }
}).single('file');

// ENDPOINTS

/**
 * @api {get} /api/file/:id?party=xyz File Access
 * @apiName getFile
 * @apiGroup fileController
 * @apiDescription Get a single file from disk; no user specific auth: partyToken is sufficient!
 * @apiPermission user
 * @apiHeader {String} cookie Express session cookie 'connect.sid' (checked by passport.js middleware)
 * @apiParam {String} id MediaItem ID
 * @apiParam {String} party Party ID (query param)
 * @apiSuccess {File} YourFile The requested file.
 * @apiError noFileAccess User is not member of party or file was not found or party is not active.
 */
const getFile = async (req: Request, res: Response, models: Models) => {
    const userId = req.user?.id;
    const mediaItemId = req.params.id;
    const requestPartyId = req.query.party;
    const download = req.query.download;

    try {
        const requestParty = await models.Party.findOne({
            where: { id: requestPartyId }
        });

        if (
            !requestParty ||
            (req.user &&
                requestParty.status !== 'active' &&
                req.user.role !== 'admin') ||
            !requestParty.members.includes(userId)
        ) {
            return res
                .status(401)
                .json({ success: false, msg: 'noFileAccess' });
        }

        const wantedItem = requestParty.items.find(
            (itemId: string) => itemId === mediaItemId
        );

        if (wantedItem) {
            const dbMediaItem = await models.MediaItem.findOne({
                where: { id: mediaItemId }
            });

            if (download) {
                const fileNameWithoutUuid = dbMediaItem.url.substr(37);

                res.download(
                    helpers.getFilePathFromId(dbMediaItem.url),
                    fileNameWithoutUuid
                );
            } else {
                return res.sendFile(helpers.getFilePathFromId(dbMediaItem.url));
            }
        } else {
            return res
                .status(401)
                .json({ success: false, msg: 'noFileAccess' });
        }
    } catch (error) {
        return Promise.reject(new Error(error as any));
    }
};

/**
 * @api {post} /api/file File Upload
 * @apiName upload
 * @apiGroup fileController
 * @apiDescription Upload a file. A corresponding mediaItem is generated automatically and added to the party.
 * @apiPermission user
 * @apiHeader {String} cookie Express session cookie 'connect.sid' (checked by passport.js middleware)
 * @apiParam {String} partyId Party ID
 * @apiParam {String} owner User ID of uploader
 * @apiParam {String} name Name for the new item, chosen by the user
 * @apiError fileUploadError An error occurred during upload.
 */
const upload = (
    req: Request,
    res: Response,
    models: Models,
    logger: Logger
) => {
    uploadFile(req, res, (err: any) => {
        if (err instanceof multer.MulterError) {
            logger.log('error', 'Multer error uploading file', err);

            return res.status(500).json(err);
        } else if (err) {
            logger.log('error', 'Error uploading file', err);

            return res.status(500).json(err);
        }

        if (req.file) {
            const newMediaItem = {
                id: req.newFileId, // Implicitly set by multer
                type: 'file',
                owner: req.body.owner,
                name: req.body.name,
                url: req.file.filename,
                settings: {}
            };

            if (multerFileValidator.validate(req.file).error) {
                logger.log(
                    'info',
                    `Validation error while creating multer output req.file: ${JSON.stringify(
                        multerFileValidator.validate(req.file).error
                    )}`
                );

                return res
                    .status(400)
                    .json({ success: false, msg: 'validationError' });
            }

            if (newFileMediaItemValidator.validate(newMediaItem).error) {
                logger.log(
                    'info',
                    `Validation error while creating mediaItem: ${JSON.stringify(
                        newFileMediaItemValidator.validate(newMediaItem).error
                    )}`
                );

                return res
                    .status(400)
                    .json({ success: false, msg: 'validationError' });
            }

            const insertNewItem = async () => {
                const insertSuccessful = await insertNewMediaItem(
                    req,
                    newMediaItem,
                    models,
                    logger
                );

                if (insertSuccessful) {
                    return res.status(200).json({
                        success: true,
                        msg: 'uploadSuccessful'
                    });
                } else {
                    return res
                        .status(400)
                        .json({ success: false, msg: 'fileUploadError' });
                }
            };

            return insertNewItem();
        } else {
            return null;
        }
    });
};

export default { getFile, upload };
