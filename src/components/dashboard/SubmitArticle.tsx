import React, { useEffect, useState } from 'react';
import { Upload, FileText, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Conference } from '../../types/database.types';
import { isSupportedArticleFile } from '../../utils/articleFiles';

const SubmitArticle: React.FC = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    title: '',
    abstract: '',
    keywords: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    const fetchConferences = async () => {
      try {
        const { data, error: conferencesError } = await supabase
          .from('conferences')
          .select('id, title, start_date, end_date, status, is_public')
          .eq('is_public', true)
          .order('start_date', { ascending: false });

        if (conferencesError) throw conferencesError;
        setConferences((data as Conference[]) || []);
      } catch (fetchError) {
        console.error('Error loading conferences:', fetchError);
      }
    };

    fetchConferences();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!isSupportedArticleFile(selectedFile)) {
        setError(t('submitArticle.invalidFileType'));
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError(t('submitArticle.invalidFileSize'));
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (conferences.length > 0 && !selectedConferenceId) {
      setError(t('submitArticle.conferenceRequired'));
      return;
    }

    const parsedKeywords = formData.keywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);

    if (parsedKeywords.length === 0) {
      setError(t('submitArticle.keywordsRequired'));
      return;
    }

    if (!file) {
      setError(t('submitArticle.fileRequired'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      let filePath = '';
      let fileName = '';

      const fileName_timestamp = `${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('articles')
        .upload(`${user.id}/${fileName_timestamp}`, file);

      if (uploadError) throw uploadError;

      // Store storage path; signed URL is generated on demand when viewing/downloading.
      filePath = `${user.id}/${fileName_timestamp}`;
      fileName = file.name;

      const { error: articleError } = await supabase
        .from('articles')
        .insert([
          {
            title: formData.title,
            abstract: formData.abstract,
            keywords: parsedKeywords,
            file_url: filePath,
            file_name: fileName,
            conference_id: selectedConferenceId || null,
            author_id: user.id,
          },
        ]);

      if (articleError) throw articleError;

      setSuccess(true);
      setFormData({ title: '', abstract: '', keywords: '' });
      setSelectedConferenceId('');
      setFile(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  if (success) {
    return (
      <div className="app-card app-empty-state">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t('submitArticle.successTitle')}</h2>
        <p className="text-gray-600 mb-6">
          {t('submitArticle.successDescription')}
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="app-btn-primary-lg"
        >
          {t('submitArticle.submitAnother')}
        </button>
      </div>
    );
  }

  return (
    <div className="app-card">
      <div className="app-card-header">
        <h1 className="text-xl font-bold text-gray-900">{t('submitArticle.pageTitle')}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {t('submitArticle.pageDescription')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="app-card-body space-y-6">
        {error && (
          <div className="app-alert-error">
            <p className="app-alert-error-text">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="conference_id" className="app-label">
            {t('submitArticle.conferenceLabel')}
          </label>
          <select
            id="conference_id"
            name="conference_id"
            value={selectedConferenceId}
            onChange={(event) => setSelectedConferenceId(event.target.value)}
            required={conferences.length > 0}
            className="app-input"
          >
            <option value="">{t('submitArticle.conferencePlaceholder')}</option>
            {conferences.map((conference) => (
              <option key={conference.id} value={conference.id}>
                {conference.title}
              </option>
            ))}
          </select>
          {conferences.length === 0 && (
            <p className="mt-2 text-sm text-amber-600">{t('submitArticle.noConferencesAvailable')}</p>
          )}
        </div>

        <div>
          <label htmlFor="title" className="app-label">
            {t('submitArticle.titleLabel')}
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            value={formData.title}
            onChange={handleInputChange}
            className="app-input"
            placeholder={t('submitArticle.titlePlaceholder')}
          />
        </div>

        <div>
          <label htmlFor="abstract" className="app-label">
            {t('submitArticle.abstractLabel')}
          </label>
          <textarea
            id="abstract"
            name="abstract"
            required
            rows={6}
            value={formData.abstract}
            onChange={handleInputChange}
            className="app-textarea"
            placeholder={t('submitArticle.abstractPlaceholder')}
          />
        </div>

        <div>
          <label htmlFor="keywords" className="app-label">
            {t('submitArticle.keywordsLabel')}
          </label>
          <input
            type="text"
            id="keywords"
            name="keywords"
            required
            value={formData.keywords}
            onChange={handleInputChange}
            className="app-input"
            placeholder={t('submitArticle.keywordsPlaceholder')}
          />
        </div>

        <div>
          <label className="app-label">
            {t('submitArticle.fileLabel')}
          </label>
          
          {!file ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="mt-4">
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer app-btn-primary"
                >
                  {t('submitArticle.uploadButton')}
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {t('submitArticle.uploadHint')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {t('submitArticle.fileSizeMb', { size: (file.size / (1024 * 1024)).toFixed(2) })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-4 pt-6">
          <button
            type="submit"
            disabled={
              loading ||
              !formData.title.trim() ||
              !formData.abstract.trim() ||
              !formData.keywords.trim() ||
              !file ||
              (conferences.length > 0 && !selectedConferenceId)
            }
            className="app-btn-primary-lg flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{loading ? t('submitArticle.submitLoading') : t('submitArticle.submitButton')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default SubmitArticle;
