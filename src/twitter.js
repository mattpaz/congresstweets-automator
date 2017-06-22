import Twit from 'twit'
import _ from 'lodash'
import {
    checkDateValidity,
    getTime,
} from './util'

export class Tweet {
    static getLink(data, isRetweet) {
        const {
            user: {
                screen_name: screenName,
            },
            id_str: tweetId,
        } =
        isRetweet ? data.retweeted_status : data
        return `https://www.twitter.com/${screenName}/statuses/${tweetId}`
    }

    static parseText(data, isRetweet, isQuote) {
        if (isRetweet) return `RT @${data.retweeted_status.user.screen_name} ${data.retweeted_status.full_text}`
        else if (isQuote) return `${data.full_text} QT @${data.quoted_status.user.screen_name} ${data.quoted_status.full_text}`
        return data.full_text
    }

    constructor(data) {
        const isRetweet = _.has(data, 'retweeted_status')
        const isQuote = _.has(data, 'quoted_status')
        this.id = data.id_str
        this.screen_name = data.user.screen_name
        this.time = getTime(new Date(data.created_at), true)
        this.link = this.constructor.getLink(data, isRetweet)
        this.text = this.constructor.parseText(data, isRetweet, isQuote)
            // eslint-disable-next-line no-useless-escape
        this.source = data.source.split('"nofollow"\>')[1].slice(0, -4)
    }
}

export class TwitterHelper {

    async getStatuses(sinceId = undefined, maxId = undefined) {
        const props = _.omitBy({
            list_id: this.listId,
            count: 200,
            tweet_mode: 'extended',
            since_id: sinceId,
            max_id: maxId,
        }, _.isNil)
        try {
            return (await this
                .client
                .get('/lists/statuses', props)).data
        } catch (e) {
            return Promise.reject(e)
        }
    }

    async updateList(action, ids) {
        const props = ({
            list_id: this.listId,
            user_id: ids,
        })
        try {
            return (await this
                .client
                .post(`/lists/members/${action}_all`,
                    props)).data
        } catch (e) {
            return Promise.reject(e)
        }
    }

    async getUserStatuses(userId, maxId) {
        const props = _.omitBy({
            user_id: userId,
            count: 200,
            tweet_mode: 'extended',
            max_id: maxId,
        }, _.isNil)
        try {
            return (await this
                .client
                .get('statuses/user_timeline', props)
            ).data
        } catch (e) {
            return Promise.reject(e)
        }
    }


    async run(data, options = {}) {
        let isValid = true
        let lastTweet
        const {
            time,
            sinceId,
        } = data
        const {
            maintenance: isMaintenance,
        } = options
        let newSinceId
        let maxId
        let count = 0
        let tweetsCollection = time.yesterdayDate ? {
            yesterday: [],
            today: [],
        } : []

        while (isValid) {
            try {
                /* eslint-disable no-await-in-loop */
                const tweets = await (isMaintenance ?
                        this.getUserStatuses(data.ids[count], maxId) :
                        this.getStatuses(sinceId, maxId)
                    )
                    /* eslint-enable no-await-in-loop */
                if (!isMaintenance) count += 1
                if (tweets.length > 0) {
                    if (count === 1 && !isMaintenance) newSinceId = _.head(tweets).id_str
                    lastTweet = _.last(tweets)
                }
                if (lastTweet.id_str === maxId || tweets.length === 0) break
                else {
                    if (time.yesterdayDate) {
                        tweetsCollection = tweets.reduce((p, c) => {
                            const {
                                created_at: createdAt,
                            } = c
                            if (checkDateValidity(createdAt, time.todayDate)) {
                                p.today.push(new Tweet(c))
                            } else p.yesterday.push(new Tweet(c))
                            return p
                        }, tweetsCollection)
                    } else {
                        tweetsCollection.push(...tweets
                            .filter(x => checkDateValidity(x.created_at, time.todayDate))
                            .map(tweet => new Tweet(tweet)))
                    }
                    if (isMaintenance) {
                        if (!checkDateValidity(lastTweet.created_at, time.todayDate)) count += 1
                    }

                    isValid = isMaintenance ? count < data.ids.length :
                        checkDateValidity(lastTweet.created_at, time.todayDate)

                    if (!isValid) break
                    maxId = lastTweet.id_str
                }
            } catch (e) {
                break
            }
        }

        return {
            sinceId: newSinceId,
            success: count > 0,
            tweets: time.yesterdayDate ? _.values(tweetsCollection) : tweetsCollection,
        }
    }

    constructor(config, listId) {
        this.client = new Twit(config)
        this.listId = listId
    }
}